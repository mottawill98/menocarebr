import { createSupabaseAdmin } from "@tracking/shared";
import type { Click, MetaEvent, WebhookLog } from "@tracking/shared";
import type { Env } from "./env.js";

/**
 * `GET /health` (item 39 do briefing). Usado tanto por monitoramento externo
 * quanto pela pagina "Saude" do dashboard (que chama este endpoint via rota
 * interna autenticada, nunca expondo o Worker cru ao browser do usuario).
 */
export async function handleHealth(env: Env): Promise<Response> {
  const checks: Record<string, unknown> = {
    worker: "ok",
    meta_configured: Boolean(env.META_ACCESS_TOKEN && env.META_DATASET_ID),
    meta_test_mode: Boolean(env.META_TEST_EVENT_CODE),
  };

  let supabaseOk = false;
  try {
    const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const [{ data: lastClick }, { data: lastWebhook }, { data: lastMetaEvent }, appSettingsProbe] = await Promise.all([
      supabase.from("clicks").select("*").order("clicked_at", { ascending: false }).limit(1).maybeSingle().returns<Click>(),
      supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .returns<WebhookLog>(),
      supabase
        .from("meta_events")
        .select("*")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .returns<MetaEvent>(),
      supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    supabaseOk = !appSettingsProbe.error;
    checks.supabase = supabaseOk ? "ok" : "error";
    checks.last_click_at = lastClick?.clicked_at ?? null;
    checks.last_crm_webhook_at = lastWebhook?.created_at ?? null;
    checks.last_crm_webhook_endpoint = lastWebhook?.endpoint ?? null;
    checks.last_meta_purchase_sent_at = lastMetaEvent?.sent_at ?? null;
  } catch (err) {
    checks.supabase = "error";
    checks.supabase_error = err instanceof Error ? err.message : String(err);
  }

  checks.queues_configured = Boolean(env.CLICKS_QUEUE && env.META_EVENTS_QUEUE);
  checks.kv_configured = Boolean(env.ROUTES_KV);

  const overall = supabaseOk ? "ok" : "degraded";

  return new Response(JSON.stringify({ status: overall, checks, checked_at: new Date().toISOString() }), {
    status: supabaseOk ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}
