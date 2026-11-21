export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL";
export const DEFAULT_GRAPH_VERSION = "v21.0";

/**
 * `action_source` valido conforme a documentacao atual da Conversions API
 * (developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event,
 * consultado em 2026-09-17): email | website | app | phone_call | chat |
 * physical_store | system_generated | business_messaging | other.
 *
 * Usamos `chat` porque nossos numeros NAO estao no WhatsApp Business
 * Platform: nao ha `ctwa_clid`, nao ha objeto de referral oficial. O valor
 * `business_messaging` e explicitamente para anuncios "click to Messenger /
 * Instagram / WhatsApp" dentro do ecossistema oficial (exige `ctwa_clid`),
 * o que o prompt do usuario proibiu expressamente. `chat` e descrito pela
 * Meta como "conversion made through messaging apps, SMS, or online
 * messaging" — exatamente o nosso caso.
 */
export const META_ACTION_SOURCE = "chat" as const;

export type ProfileRole = "ADMIN" | "MANAGER" | "VIEWER";

export type OrderStatus =
  | "pending"
  | "created"
  | "approved"
  | "paid"
  | "cancelled"
  | "refunded"
  | "chargeback"
  | "unknown";

export type AttributionMethod = "click_ref" | "phone_hash" | "unmatched";

export type MetaEventStatus = "pending" | "processing" | "sent" | "failed" | "dead_letter";

export const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
export const MAX_META_EVENT_ATTEMPTS = 8;

/** Backoff exponencial com jitter, em segundos, indexado pelo numero da tentativa (1-based). */
export function backoffSeconds(attempt: number): number {
  const base = Math.min(2 ** attempt, 3600);
  const jitter = Math.random() * base * 0.2;
  return Math.round(base + jitter);
}
