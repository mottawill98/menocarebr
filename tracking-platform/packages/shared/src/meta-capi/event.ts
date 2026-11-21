import { META_ACTION_SOURCE } from "../constants.js";
import { hashUserDataField } from "./hash.js";

export interface PurchaseEventInput {
  crmOrderId: string;
  eventTime: Date;
  value: number;
  currency: string;
  /** Telefone ja normalizado (mesma normalizacao usada no phone_hash interno), NAO hasheado ainda. */
  normalizedPhone?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  /** Identificador estavel do lado da casa, tipicamente o click_ref. */
  externalId?: string | null;
  testEventCode?: string | null;
}

export interface MetaServerEvent {
  event_name: "Purchase";
  event_time: number;
  event_id: string;
  action_source: typeof META_ACTION_SOURCE;
  user_data: Record<string, string>;
  custom_data: { currency: string; value: number };
}

export interface MetaEventPayload {
  data: MetaServerEvent[];
  test_event_code?: string;
}

/**
 * `event_id` estavel e idempotente: mesma venda -> mesmo event_id, sempre.
 * Isso garante deduplicacao mesmo se o CRM reenviar o webhook N vezes (cada
 * reenvio gera o mesmo evento, e o `UNIQUE` em `meta_events.event_id` evita
 * insercao duplicada antes mesmo de chegar na Meta).
 */
export function buildPurchaseEventId(crmOrderId: string): string {
  return `purchase:${crmOrderId}`;
}

export async function buildPurchaseEvent(input: PurchaseEventInput): Promise<MetaEventPayload> {
  const userData: Record<string, string> = {};

  if (input.normalizedPhone) {
    userData.ph = await hashUserDataField(input.normalizedPhone);
  }
  if (input.externalId) {
    userData.external_id = await hashUserDataField(input.externalId);
  }
  // fbc/fbp/ip/user-agent NUNCA sao hasheados (ver meta-capi/hash.ts).
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;

  const event: MetaServerEvent = {
    event_name: "Purchase",
    event_time: Math.floor(input.eventTime.getTime() / 1000),
    event_id: buildPurchaseEventId(input.crmOrderId),
    action_source: META_ACTION_SOURCE,
    user_data: userData,
    custom_data: {
      currency: input.currency,
      value: Number(input.value.toFixed(2)),
    },
  };

  const payload: MetaEventPayload = { data: [event] };
  if (input.testEventCode) payload.test_event_code = input.testEventCode;
  return payload;
}
