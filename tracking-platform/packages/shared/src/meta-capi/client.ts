import { DEFAULT_GRAPH_VERSION, RETRYABLE_HTTP_STATUS } from "../constants.js";
import type { MetaEventPayload } from "./event.js";

export interface MetaCapiConfig {
  accessToken: string;
  datasetId: string;
  graphVersion?: string;
  /** Override do host base (default `https://graph.facebook.com`). Usado apenas por `scripts/mocks/meta-capi-mock.ts` em desenvolvimento. */
  graphBaseUrl?: string;
}

export interface SendMetaEventResult {
  ok: boolean;
  httpStatus: number;
  /** Resposta da Meta, ja sanitizada (nunca contem o access_token). */
  responseBody: unknown;
  /** `true` quando o erro e permanente (4xx que nao seja 429) — nao adianta tentar de novo. */
  isPermanentError: boolean;
}

/**
 * Envia um evento para a Conversions API. NUNCA deve ser chamado no caminho
 * critico de um webhook do CRM — sempre a partir do consumer da fila
 * `meta-events-queue`.
 *
 * Endpoint e versao seguem
 * developers.facebook.com/docs/marketing-api/conversions-api/get-started
 * (consultado em 2026-09-17): `POST /{GRAPH_VERSION}/{DATASET_ID}/events`.
 * A versao e configuravel via env (`META_GRAPH_VERSION`) porque a Meta
 * aposenta versoes antigas periodicamente — nunca hardcode em outro lugar.
 */
export async function sendMetaEvent(
  config: MetaCapiConfig,
  payload: MetaEventPayload,
  fetchImpl: typeof fetch = fetch
): Promise<SendMetaEventResult> {
  const version = config.graphVersion || DEFAULT_GRAPH_VERSION;
  const base = config.graphBaseUrl || "https://graph.facebook.com";
  const url = `${base}/${version}/${config.datasetId}/events`;

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, access_token: config.accessToken }),
    });

    const responseBody = await res.json().catch(() => ({}));

    if (res.ok) {
      return { ok: true, httpStatus: res.status, responseBody, isPermanentError: false };
    }

    const isRetryable = RETRYABLE_HTTP_STATUS.has(res.status);
    return {
      ok: false,
      httpStatus: res.status,
      responseBody,
      isPermanentError: !isRetryable,
    };
  } catch (err) {
    // Erro de rede/timeout: sempre tratado como retentavel.
    return {
      ok: false,
      httpStatus: 0,
      responseBody: { error: err instanceof Error ? err.message : String(err) },
      isPermanentError: false,
    };
  }
}

/** Envia um evento de teste usando `test_event_code`, para o botao "Enviar evento de teste" do dashboard. */
export async function sendMetaTestEvent(
  config: MetaCapiConfig,
  testEventCode: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendMetaEventResult> {
  const payload: MetaEventPayload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `test:${crypto.randomUUID()}`,
        action_source: "chat",
        user_data: {},
        custom_data: { currency: "BRL", value: 1 },
      },
    ],
    test_event_code: testEventCode,
  };
  return sendMetaEvent(config, payload, fetchImpl);
}
