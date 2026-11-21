import { createSupabaseAdmin, generateClickRef } from "@tracking/shared";
import type { Env, ClickQueueMessage } from "../env.js";
import { logger } from "../logger.js";

const UNIQUE_VIOLATION = "23505";

/**
 * Consumer da fila `tracking-clicks`. Roda fora do caminho critico do
 * redirect: se falhar e o Cloudflare Queues fizer retry automatico
 * (configurado em wrangler.toml), o usuario ja esta havia muito tempo no
 * WhatsApp — nenhuma experiencia e afetada.
 */
export async function processClicksBatch(batch: MessageBatch<ClickQueueMessage>, env: Env): Promise<void> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  for (const message of batch.messages) {
    try {
      const clickId = await insertClickWithRetry(supabase, message.body);
      await resolvePendingLeadBindings(supabase, message.body.click_ref, clickId);
      message.ack();
    } catch (err) {
      logger.error({
        request_id: "queue:clicks",
        event: "click_persist_failed",
        click_ref: message.body.click_ref,
        error: err instanceof Error ? err.message : String(err),
      });
      message.retry();
    }
  }
}

async function insertClickWithRetry(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  click: ClickQueueMessage,
  attemptsLeft = 3
): Promise<string> {
  const { data, error } = await supabase
    .from("clicks")
    .insert({
      click_ref: click.click_ref,
      route_id: click.route_id,
      whatsapp_number_id: click.whatsapp_number_id,
      clicked_at: click.clicked_at,
      fbclid: click.fbclid,
      fbc: click.fbc,
      fbp: click.fbp,
      utm_source: click.utm_source,
      utm_medium: click.utm_medium,
      utm_campaign: click.utm_campaign,
      utm_content: click.utm_content,
      utm_term: click.utm_term,
      campaign_id: click.campaign_id,
      campaign_name: click.campaign_name,
      adset_id: click.adset_id,
      adset_name: click.adset_name,
      ad_id: click.ad_id,
      ad_name: click.ad_name,
      placement: click.placement,
      referrer: click.referrer,
      client_user_agent: click.client_user_agent,
      client_ip_address: click.client_ip_address,
      extra_params: click.extra_params,
    })
    .select("id")
    .single();

  if (!error) return data.id;

  // Colisao de click_ref (extremamente rara: 1 em ~8.5e11): gera outro e
  // tenta de novo, em vez de perder o clique.
  if (error.code === UNIQUE_VIOLATION && attemptsLeft > 0) {
    logger.warn({ request_id: "queue:clicks", event: "click_ref_collision", click_ref: click.click_ref });
    return insertClickWithRetry(supabase, { ...click, click_ref: generateClickRef() }, attemptsLeft - 1);
  }

  throw new Error(`insert click falhou: ${error.message}`);
}

/**
 * Resolucao orientada a evento das pendencias (item 13 do briefing): assim
 * que o clique e persistido, verifica se alguma mensagem do CRM ja chegou
 * antes com esse `click_ref` (condicao de corrida) e, se sim, cria o
 * `lead_binding` imediatamente — sem esperar a varredura periodica do cron.
 */
async function resolvePendingLeadBindings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  clickRef: string,
  clickId: string
): Promise<void> {
  const { data: pending, error } = await supabase
    .from("pending_lead_bindings")
    .select("*")
    .eq("click_ref", clickRef)
    .eq("resolved", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !pending) return;

  const { error: leadError } = await supabase.from("lead_bindings").insert({
    click_id: clickId,
    click_ref: clickRef,
    phone_hash: pending.phone_hash,
    phone_last4: pending.phone_last4,
    initial_message: pending.initial_message,
    source: "crm_message_reconciled",
  });

  if (leadError) {
    logger.error({ request_id: "queue:clicks", event: "lead_binding_reconcile_failed", click_ref: clickRef, error: leadError.message });
    return;
  }

  await supabase.from("clicks").update({ lead_bound: true, lead_bound_at: new Date().toISOString() }).eq("id", clickId);
  await supabase.from("pending_lead_bindings").update({ resolved: true }).eq("id", pending.id);

  logger.info({ request_id: "queue:clicks", event: "pending_lead_binding_reconciled", click_ref: clickRef });
}
