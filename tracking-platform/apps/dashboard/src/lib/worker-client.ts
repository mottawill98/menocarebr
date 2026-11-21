import "server-only";

const WORKER_URL = process.env.WORKER_URL; // ex.: https://go.usemenocare.com.br
const INTERNAL_API_TOKEN = process.env.WORKER_INTERNAL_API_TOKEN;

function assertConfigured(): void {
  if (!WORKER_URL || !INTERNAL_API_TOKEN) {
    throw new Error("WORKER_URL e WORKER_INTERNAL_API_TOKEN precisam estar configurados para chamar o Worker.");
  }
}

async function callInternal<T>(path: string, body?: unknown): Promise<T> {
  assertConfigured();
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${INTERNAL_API_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    throw new Error(`Worker respondeu ${res.status} em ${path}`);
  }
  return json;
}

/** Invalida/recarrega o cache do KV de uma rota depois de editar rota/número/vínculo (item 49). */
export async function refreshRouteCache(slug: string): Promise<void> {
  await callInternal("/internal/kv/refresh", { slug });
}

export async function invalidateRouteCache(slug: string): Promise<void> {
  await callInternal("/internal/kv/invalidate", { slug });
}

export interface ResendMetaEventResult {
  ok: boolean;
  event: { status: string; http_status: number | null; error_message: string | null } | null;
}

/** Reenvia um evento Meta específico (botão "Reenviar" da página Meta CAPI). */
export async function resendMetaEvent(metaEventId: string): Promise<ResendMetaEventResult> {
  return callInternal(`/internal/meta-events/${metaEventId}/resend`);
}

export interface SendTestEventResult {
  ok: boolean;
  http_status: number;
  response: unknown;
}

export async function sendMetaTestEvent(): Promise<SendTestEventResult> {
  return callInternal("/internal/meta-events/test");
}

export function isWorkerConfigured(): boolean {
  return Boolean(WORKER_URL && INTERNAL_API_TOKEN);
}
