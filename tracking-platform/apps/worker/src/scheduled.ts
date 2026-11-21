import { createSupabaseAdmin } from "@tracking/shared";
import type { Env, MetaEventQueueMessage } from "./env.js";
import { logger } from "./logger.js";

const RECONCILE_BATCH_SIZE = 50;
const RECONCILE_RETRY_MINUTES = 5;
const RECONCILE_GIVE_UP_AFTER_HOURS = 48;

/**
 * Cron (a cada 5 minutos, ver `[triggers]` no wrangler.toml). Cobre tres
 * responsabilidades que nao podem depender so do caminho orientado a evento:
 *  1. Fallback de reconciliacao de `pending_lead_bindings` (item 13).
 *  2. Retentativa de `meta_events` com backoff vencido (itens 22-23).
 *  3. Limpeza/anonimizacao de dados conforme retencao (item 41).
 */
export async function handleScheduled(env: Env): Promise<void> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  await Promise.all([
    reconcilePendingLeadBindings(supabase),
    retryFailedMetaEvents(supabase, env),
    enforceRetention(supabase),
  ]);
}

async function reconcilePendingLeadBindings(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<void> {
  const { data: pendingList, error } = await supabase
    .from("pending_lead_bindings")
    .select("*")
    .eq("resolved", false)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(RECONCILE_BATCH_SIZE);

  if (error || !pendingList?.length) return;

  for (const pending of pendingList) {
    const ageHours = (Date.now() - new Date(pending.created_at).getTime()) / (1000 * 60 * 60);

    const { data: click } = await supabase.from("clicks").select("id").eq("click_ref", pending.click_ref).maybeSingle();

    if (click) {
      const { error: leadError } = await supabase.from("lead_bindings").insert({
        click_id: click.id,
        click_ref: pending.click_ref,
        phone_hash: pending.phone_hash,
        phone_last4: pending.phone_last4,
        initial_message: pending.initial_message,
        source: "crm_message_reconciled_cron",
      });

      if (!leadError) {
        await supabase.from("clicks").update({ lead_bound: true, lead_bound_at: new Date().toISOString() }).eq("id", click.id);
      }
      await supabase.from("pending_lead_bindings").update({ resolved: true }).eq("id", pending.id);
      logger.info({ request_id: "cron:reconcile", event: "pending_lead_binding_reconciled_cron", click_ref: pending.click_ref });
      continue;
    }

    if (ageHours >= RECONCILE_GIVE_UP_AFTER_HOURS) {
      // O clique nunca apareceu (ex.: usuario apagou o click_ref e digitou
      // outro codigo, ou o clique de fato nao existe). Paramos de tentar,
      // mas NUNCA apagamos o registro — fica disponivel para auditoria.
      logger.warn({ request_id: "cron:reconcile", event: "pending_lead_binding_gave_up", click_ref: pending.click_ref, age_hours: ageHours });
      await supabase
        .from("pending_lead_bindings")
        .update({ next_attempt_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString() })
        .eq("id", pending.id);
      continue;
    }

    await supabase
      .from("pending_lead_bindings")
      .update({
        attempts: pending.attempts + 1,
        next_attempt_at: new Date(Date.now() + RECONCILE_RETRY_MINUTES * 60 * 1000).toISOString(),
      })
      .eq("id", pending.id);
  }
}

async function retryFailedMetaEvents(supabase: ReturnType<typeof createSupabaseAdmin>, env: Env): Promise<void> {
  const { data: dueEvents, error } = await supabase
    .from("meta_events")
    .select("id")
    .eq("status", "failed")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(RECONCILE_BATCH_SIZE);

  if (error || !dueEvents?.length) return;

  for (const event of dueEvents) {
    const message: MetaEventQueueMessage = { meta_event_id: event.id };
    await env.META_EVENTS_QUEUE.send(message).catch((err) => {
      logger.error({ request_id: "cron:meta-retry", event: "requeue_failed", meta_event_id: event.id, error: String(err) });
    });
  }

  logger.info({ request_id: "cron:meta-retry", event: "meta_events_requeued", count: dueEvents.length });
}

async function enforceRetention(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<void> {
  const retentionCutoff = new Date(Date.now() - (await getLogRetentionDays(supabase)) * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("webhook_logs").delete().lt("created_at", retentionCutoff);
  await supabase.from("redirect_misses").delete().lt("created_at", retentionCutoff);

  // Minimizacao de dados (item 41): anonimiza IP/user-agent de cliques
  // antigos, mantendo o resto do clique intacto para relatorios historicos.
  await supabase
    .from("clicks")
    .update({ client_ip_address: null, client_user_agent: null })
    .lt("clicked_at", retentionCutoff)
    .not("client_ip_address", "is", null);
}

async function getLogRetentionDays(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<number> {
  const { data } = await supabase.from("app_settings").select("log_retention_days").eq("id", 1).maybeSingle();
  return data?.log_retention_days ?? 90;
}
