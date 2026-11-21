import {
  buildPurchaseEvent,
  buildPurchaseEventId,
  createSupabaseAdmin,
  normalizeCRMOrder,
  normalizePhone,
  phoneHash,
  phoneLast4,
  type OrderStatus,
} from "@tracking/shared";
import type { Env, MetaEventQueueMessage } from "../env.js";
import { logger } from "../logger.js";
import { checkRateLimit } from "../rate-limit.js";
import { attributeOrder } from "../attribution.js";
import { getSettingsWithClient } from "../settings.js";
import { recordWebhookLog } from "./log.js";
import { jsonResponse, verifyWebhookRequest } from "./verify.js";

const UNIQUE_VIOLATION = "23505";
const KNOWN_STATUSES: OrderStatus[] = ["pending", "created", "approved", "paid", "cancelled", "refunded", "chargeback", "unknown"];

function normalizeStatusEnum(rawStatus: string): OrderStatus {
  const lower = rawStatus.toLowerCase();
  return (KNOWN_STATUSES as string[]).includes(lower) ? (lower as OrderStatus) : "unknown";
}

/**
 * `POST /api/v1/webhooks/crm/order` — itens 14 a 24 do briefing.
 *
 * Fluxo: valida -> normaliza -> atribui ao clique (click_ref > phone_hash >
 * unmatched) -> upsert idempotente do pedido -> se o status mapear para
 * "purchase" (mapeamento configuravel), cria (idempotente, via UNIQUE em
 * event_id) um registro em `meta_events` e enfileira o envio. NUNCA chama a
 * Meta diretamente aqui.
 */
export async function handleCrmOrderWebhook(request: Request, env: Env, requestId: string): Promise<Response> {
  const startedAt = Date.now();

  const rate = await checkRateLimit(env, "crm-order", 120, 60);
  if (!rate.allowed) {
    return jsonResponse(429, { error: "rate limit excedido", request_id: requestId });
  }

  const verified = await verifyWebhookRequest(request, env);
  if (!verified.ok) {
    await recordWebhookLog(env, {
      endpoint: "crm/order",
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

  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const normalized = normalizeCRMOrder(payload);
    const settings = await getSettingsWithClient(supabase);

    const normalizedPhone = normalized.phone_raw ? normalizePhone(normalized.phone_raw) : null;
    const hash = normalizedPhone ? await phoneHash(normalizedPhone) : null;
    const last4 = normalizedPhone ? phoneLast4(normalizedPhone) : null;

    const orderedAt = normalized.ordered_at ? new Date(normalized.ordered_at) : new Date();

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, click_id, click_ref, attribution_method, attribution_status")
      .eq("crm_order_id", normalized.crm_order_id)
      .maybeSingle();

    // Nao rebaixa uma atribuicao ja resolvida numa atualizacao posterior do mesmo pedido.
    const attribution =
      existingOrder && existingOrder.attribution_status === "attributed"
        ? {
            clickId: existingOrder.click_id,
            clickRef: existingOrder.click_ref,
            method: existingOrder.attribution_method,
            status: existingOrder.attribution_status as "attributed",
          }
        : await attributeOrder(supabase, {
            clickRef: normalized.click_ref ?? null,
            phoneHash: hash,
            orderedAt,
            attributionWindowDays: settings.attribution_window_days,
          });

    const statusEnum = normalizeStatusEnum(normalized.status);

    const { data: upsertedOrder, error: upsertError } = await supabase
      .from("orders")
      .upsert(
        {
          crm_order_id: normalized.crm_order_id,
          phone_hash: hash,
          phone_last4: last4,
          click_id: attribution.clickId,
          click_ref: attribution.clickRef,
          status: statusEnum,
          raw_status: normalized.status,
          value: normalized.value,
          currency: normalized.currency,
          seller: normalized.seller,
          ordered_at: orderedAt.toISOString(),
          paid_at: normalized.paid_at,
          attribution_status: attribution.status,
          attribution_method: attribution.method,
          raw_metadata: normalized.metadata,
        },
        { onConflict: "crm_order_id" }
      )
      .select("id")
      .single();

    if (upsertError || !upsertedOrder) {
      throw new Error(`falha ao gravar pedido: ${upsertError?.message}`);
    }

    const mappedEvent = settings.crm_status_mapping[normalized.status.toLowerCase()] ?? "none";
    const eligibleForMeta =
      mappedEvent === "purchase" && (attribution.status === "attributed" || settings.send_unmatched_orders_to_meta);

    let metaEventQueued = false;
    if (eligibleForMeta) {
      metaEventQueued = await enqueueMetaPurchaseEvent(supabase, env, {
        orderId: upsertedOrder.id,
        crmOrderId: normalized.crm_order_id,
        clickId: attribution.clickId,
        eventTime: normalized.paid_at ? new Date(normalized.paid_at) : orderedAt,
        value: normalized.value,
        currency: normalized.currency,
        normalizedPhone,
        externalId: attribution.clickRef,
      });
    }

    await recordWebhookLog(env, {
      endpoint: "crm/order",
      requestId,
      status: 200,
      durationMs: Date.now() - startedAt,
      result: `attribution=${attribution.method};meta_queued=${metaEventQueued}`,
    });

    logger.info({
      request_id: requestId,
      event: "crm_order_processed",
      crm_order_id: normalized.crm_order_id,
      attribution_method: attribution.method,
      meta_event_queued: metaEventQueued,
      duration_ms: Date.now() - startedAt,
    });

    return jsonResponse(200, {
      ok: true,
      attribution_method: attribution.method,
      meta_event_queued: metaEventQueued,
      request_id: requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordWebhookLog(env, {
      endpoint: "crm/order",
      requestId,
      status: 422,
      durationMs: Date.now() - startedAt,
      result: "error",
      errorMessage: message,
    });
    logger.error({ request_id: requestId, event: "crm_order_error", error: message });
    return jsonResponse(422, { error: message, request_id: requestId });
  }
}

interface EnqueueMetaPurchaseInput {
  orderId: string;
  crmOrderId: string;
  clickId: string | null;
  eventTime: Date;
  value: number;
  currency: string;
  normalizedPhone: string | null;
  externalId: string | null;
}

/**
 * Cria o registro em `meta_events` (idempotente via UNIQUE em event_id) e
 * enfileira o envio. Se o evento ja existir (reenvio do mesmo status, ou
 * pedido que passou por dois status que mapeiam para "purchase"), a
 * constraint UNIQUE barra a duplicata e simplesmente nao enfileiramos de
 * novo — nenhum Purchase duplicado chega na Meta.
 */
async function enqueueMetaPurchaseEvent(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  env: Env,
  input: EnqueueMetaPurchaseInput
): Promise<boolean> {
  const eventId = buildPurchaseEventId(input.crmOrderId);

  let fbc: string | null = null;
  let fbp: string | null = null;
  let clientIp: string | null = null;
  let clientUserAgent: string | null = null;

  if (input.clickId) {
    const { data: click } = await supabase
      .from("clicks")
      .select("fbc, fbp, client_ip_address, client_user_agent")
      .eq("id", input.clickId)
      .maybeSingle();
    if (click) {
      fbc = click.fbc;
      fbp = click.fbp;
      clientIp = click.client_ip_address;
      clientUserAgent = click.client_user_agent;
    }
  }

  const payload = await buildPurchaseEvent({
    crmOrderId: input.crmOrderId,
    eventTime: input.eventTime,
    value: input.value,
    currency: input.currency,
    normalizedPhone: input.normalizedPhone,
    fbc,
    fbp,
    clientIpAddress: clientIp,
    clientUserAgent,
    externalId: input.externalId,
    testEventCode: env.META_TEST_EVENT_CODE || null,
  });

  const { data: metaEvent, error } = await supabase
    .from("meta_events")
    .insert({
      event_id: eventId,
      order_id: input.orderId,
      click_id: input.clickId,
      event_name: "Purchase",
      event_time: input.eventTime.toISOString(),
      payload_sanitized: payload as unknown as Record<string, unknown>,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false; // ja existe: idempotencia garantida.
    throw new Error(`falha ao criar meta_event: ${error.message}`);
  }

  const message: MetaEventQueueMessage = { meta_event_id: metaEvent.id };
  await env.META_EVENTS_QUEUE.send(message);
  return true;
}
