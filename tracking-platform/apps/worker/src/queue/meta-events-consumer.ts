import { backoffSeconds, createSupabaseAdmin, MAX_META_EVENT_ATTEMPTS, sendMetaEvent, type MetaEventPayload } from "@tracking/shared";
import type { Env, MetaEventQueueMessage } from "../env.js";
import { logger } from "../logger.js";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export async function processMetaEventsBatch(batch: MessageBatch<MetaEventQueueMessage>, env: Env): Promise<void> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  for (const message of batch.messages) {
    try {
      await sendOneMetaEvent(supabase, env, message.body.meta_event_id);
      message.ack();
    } catch (err) {
      logger.error({
        request_id: "queue:meta-events",
        event: "meta_event_processing_error",
        meta_event_id: message.body.meta_event_id,
        error: err instanceof Error ? err.message : String(err),
      });
      // O proprio evento ja foi marcado como failed/retry dentro de
      // `sendOneMetaEvent` (com o proximo attempt agendado); o ack aqui
      // evita reprocessar o batch inteiro do Cloudflare Queues por causa de
      // 1 evento — o retry acontece via `next_attempt_at` + cron.
      message.ack();
    }
  }
}

/**
 * Envia (ou reenvia) um evento especifico. Usado pelo consumer da fila E
 * pelo endpoint interno de reenvio manual do dashboard — mesma logica,
 * uma unica fonte de verdade para retry/backoff/dead-letter (itens 22-24).
 */
export async function sendOneMetaEvent(supabase: SupabaseAdmin, env: Env, metaEventId: string): Promise<void> {
  const { data: event, error } = await supabase.from("meta_events").select("*").eq("id", metaEventId).maybeSingle();
  if (error || !event) {
    logger.error({ request_id: "queue:meta-events", event: "meta_event_not_found", meta_event_id: metaEventId });
    return;
  }

  if (event.status === "sent") return; // ja enviado — idempotencia.

  await supabase.from("meta_events").update({ status: "processing" }).eq("id", metaEventId);

  const attempts = event.attempts + 1;
  const result = await sendMetaEvent(
    { accessToken: env.META_ACCESS_TOKEN, datasetId: env.META_DATASET_ID, graphVersion: env.META_GRAPH_VERSION, graphBaseUrl: env.META_GRAPH_BASE_URL },
    event.payload_sanitized as unknown as MetaEventPayload
  );

  const now = new Date().toISOString();

  if (result.ok) {
    await supabase
      .from("meta_events")
      .update({
        status: "sent",
        attempts,
        last_attempt_at: now,
        sent_at: now,
        http_status: result.httpStatus,
        meta_response: result.responseBody as Record<string, unknown>,
        error_message: null,
      })
      .eq("id", metaEventId);
    logger.info({ request_id: "queue:meta-events", event: "meta_event_sent", meta_event_id: metaEventId, attempts });
    return;
  }

  const errorMessage = extractErrorMessage(result.responseBody);

  if (result.isPermanentError) {
    await supabase
      .from("meta_events")
      .update({
        status: "dead_letter",
        attempts,
        last_attempt_at: now,
        http_status: result.httpStatus,
        meta_response: result.responseBody as Record<string, unknown>,
        error_message: errorMessage,
      })
      .eq("id", metaEventId);
    logger.error({ request_id: "queue:meta-events", event: "meta_event_dead_letter", meta_event_id: metaEventId, http_status: result.httpStatus });
    return;
  }

  if (attempts >= MAX_META_EVENT_ATTEMPTS) {
    await supabase
      .from("meta_events")
      .update({
        status: "dead_letter",
        attempts,
        last_attempt_at: now,
        http_status: result.httpStatus,
        meta_response: result.responseBody as Record<string, unknown>,
        error_message: `esgotou tentativas (${attempts}): ${errorMessage}`,
      })
      .eq("id", metaEventId);
    logger.error({ request_id: "queue:meta-events", event: "meta_event_max_attempts", meta_event_id: metaEventId, attempts });
    return;
  }

  const nextAttemptAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
  await supabase
    .from("meta_events")
    .update({
      status: "failed",
      attempts,
      last_attempt_at: now,
      next_attempt_at: nextAttemptAt,
      http_status: result.httpStatus,
      meta_response: result.responseBody as Record<string, unknown>,
      error_message: errorMessage,
    })
    .eq("id", metaEventId);
  logger.warn({
    request_id: "queue:meta-events",
    event: "meta_event_retry_scheduled",
    meta_event_id: metaEventId,
    attempts,
    next_attempt_at: nextAttemptAt,
    http_status: result.httpStatus,
  });
}

function extractErrorMessage(responseBody: unknown): string {
  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    const error = (responseBody as { error?: { message?: string } | string }).error;
    if (typeof error === "string") return error;
    if (error?.message) return error.message;
  }
  return "erro desconhecido";
}
