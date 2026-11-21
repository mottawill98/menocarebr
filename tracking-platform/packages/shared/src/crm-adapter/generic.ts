import {
  genericCrmMessagePayloadSchema,
  genericCrmOrderPayloadSchema,
  type GenericCrmMessagePayload,
  type GenericCrmOrderPayload,
  type NormalizedCrmMessage,
  type NormalizedCrmOrder,
} from "../schemas/crm.js";
import { extractClickRefFromMessage } from "../click-ref.js";

/**
 * Adapter generico: aceita os nomes de campo mais comuns que um CRM de
 * WhatsApp costuma usar. Serve de fallback e de referencia para escrever
 * adapters especificos (ex.: DataCrazy) sem espalhar `if (crm === 'x')` pelo
 * resto do sistema.
 */
export function normalizeGenericCrmMessage(raw: unknown): NormalizedCrmMessage {
  const payload: GenericCrmMessagePayload = genericCrmMessagePayloadSchema.parse(raw);
  const phone = payload.phone ?? payload.telephone ?? payload.from ?? payload.contact;
  if (!phone) {
    throw new Error("payload de mensagem sem campo de telefone reconhecivel");
  }

  const message = payload.message ?? payload.text ?? payload.body ?? null;

  return {
    phone_raw: phone,
    message,
    crm_conversation_id: payload.conversation_id ?? payload.chat_id ?? null,
    received_at: normalizeTimestamp(payload.timestamp),
  };
}

export function normalizeGenericCrmOrder(raw: unknown): NormalizedCrmOrder {
  const payload: GenericCrmOrderPayload = genericCrmOrderPayloadSchema.parse(raw);

  const crmOrderId = payload.order_id ?? (payload.id !== undefined ? String(payload.id) : undefined);
  if (!crmOrderId) {
    throw new Error("payload de pedido sem identificador (order_id/id)");
  }

  const phone = payload.phone ?? payload.telephone ?? payload.customer_phone ?? null;
  const valueRaw = payload.value ?? payload.total ?? payload.amount ?? 0;
  const value = typeof valueRaw === "string" ? Number(valueRaw.replace(",", ".")) : valueRaw;

  const clickRefCandidate = payload.click_ref ?? payload.tracking_ref ?? null;

  return {
    crm_order_id: crmOrderId,
    phone_raw: phone,
    customer_id: payload.customer_id !== undefined ? String(payload.customer_id) : null,
    status: payload.status ?? "unknown",
    value: Number.isFinite(value) ? Number(value) : 0,
    currency: (payload.currency ?? "BRL").toUpperCase(),
    ordered_at: normalizeTimestamp(payload.created_at ?? payload.ordered_at) ?? null,
    paid_at: normalizeTimestamp(payload.paid_at) ?? null,
    seller: payload.seller ?? null,
    click_ref: clickRefCandidate ? extractClickRefFromMessage(clickRefCandidate) ?? clickRefCandidate : null,
    metadata: sanitizeMetadata(payload),
  };
}

function normalizeTimestamp(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = typeof value === "number" ? new Date(value * (value < 10_000_000_000 ? 1000 : 1)) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

const SENSITIVE_METADATA_KEYS = new Set(["token", "access_token", "password", "authorization", "secret", "api_key"]);

/** Remove campos sensiveis antes de guardar o payload bruto em `raw_metadata`. */
export function sanitizeMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean;
}
