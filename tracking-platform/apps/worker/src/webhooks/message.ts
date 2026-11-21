import {
  createSupabaseAdmin,
  extractClickRefFromMessage,
  normalizeCRMMessage,
  normalizePhone,
  phoneHash,
  phoneLast4,
} from "@tracking/shared";
import type { Env } from "../env.js";
import { logger } from "../logger.js";
import { checkRateLimit } from "../rate-limit.js";
import { recordWebhookLog, sanitizeForLog } from "./log.js";
import { jsonResponse, verifyWebhookRequest } from "./verify.js";

const UNIQUE_VIOLATION = "23505";

/**
 * `POST /api/v1/webhooks/crm/message` — item 11 do briefing.
 *
 * Recebe a primeira mensagem de uma conversa, procura `#CLICKREF` no texto e
 * liga o telefone (via hash) ao clique correspondente. Se o clique ainda
 * nao foi persistido pela fila (condicao de corrida — item 13), guarda em
 * `pending_lead_bindings` para reconciliacao posterior em vez de perder a
 * atribuicao.
 */
export async function handleCrmMessageWebhook(request: Request, env: Env, requestId: string): Promise<Response> {
  const startedAt = Date.now();

  const rate = await checkRateLimit(env, "crm-message", 120, 60);
  if (!rate.allowed) {
    return jsonResponse(429, { error: "rate limit excedido", request_id: requestId });
  }

  const verified = await verifyWebhookRequest(request, env);
  if (!verified.ok) {
    await recordWebhookLog(env, {
      endpoint: "crm/message",
      requestId,
      status: verified.response.status,
      durationMs: Date.now() - startedAt,
      result: "auth_failed",
    });
    return verified.response;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verified.rawBody);
  } catch {
    return jsonResponse(400, { error: "JSON invalido", request_id: requestId });
  }

  try {
    const normalized = normalizeCRMMessage(payload);
    const normalizedPhone = normalizePhone(normalized.phone_raw);
    const hash = await phoneHash(normalizedPhone);
    const last4 = phoneLast4(normalizedPhone);
    const clickRef = extractClickRefFromMessage(normalized.message);

    const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    let result: "bound" | "pending" | "no_click_ref";

    if (!clickRef) {
      // Cliente apagou o click_ref (item 62): nao inventamos atribuicao.
      result = "no_click_ref";
    } else {
      const { data: click } = await supabase.from("clicks").select("id, lead_bound").eq("click_ref", clickRef).maybeSingle();

      if (click) {
        const { error: insertError } = await supabase.from("lead_bindings").insert({
          click_id: click.id,
          click_ref: clickRef,
          phone_hash: hash,
          phone_last4: last4,
          initial_message: normalized.message ?? null,
          crm_lead_id: normalized.crm_conversation_id ?? null,
          source: "crm_message",
        });

        // Unique(click_id): mensagem duplicada do mesmo lead nao gera 2 bindings.
        if (insertError && insertError.code !== UNIQUE_VIOLATION) {
          throw new Error(`falha ao criar lead_binding: ${insertError.message}`);
        }

        if (!insertError) {
          await supabase.from("clicks").update({ lead_bound: true, lead_bound_at: new Date().toISOString() }).eq("id", click.id);
        }

        result = "bound";
      } else {
        await supabase.from("pending_lead_bindings").insert({
          click_ref: clickRef,
          phone_hash: hash,
          phone_last4: last4,
          initial_message: normalized.message ?? null,
          crm_conversation_id: normalized.crm_conversation_id ?? null,
        });
        result = "pending";
      }
    }

    await recordWebhookLog(env, {
      endpoint: "crm/message",
      requestId,
      status: 200,
      durationMs: Date.now() - startedAt,
      result,
      payloadSanitized: sanitizeForLog({ ...(payload as Record<string, unknown>), phone: undefined }),
    });

    logger.info({ request_id: requestId, event: "crm_message_processed", result, duration_ms: Date.now() - startedAt });

    return jsonResponse(200, { ok: true, result, request_id: requestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordWebhookLog(env, {
      endpoint: "crm/message",
      requestId,
      status: 422,
      durationMs: Date.now() - startedAt,
      result: "error",
      errorMessage: message,
    });
    logger.error({ request_id: requestId, event: "crm_message_error", error: message });
    return jsonResponse(422, { error: message, request_id: requestId });
  }
}
