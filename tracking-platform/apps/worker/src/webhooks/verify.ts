import { verifyBearerToken, verifyWebhookSignature } from "@tracking/shared";
import type { Env } from "../env.js";

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024; // 256KB

export type WebhookVerifyResult = { ok: true; rawBody: string } | { ok: false; response: Response };

/**
 * Verifica a assinatura do webhook do CRM. Suporta os dois esquemas do
 * item 25 do briefing:
 *  - HMAC SHA-256 (`X-Webhook-Timestamp` + `X-Webhook-Signature`), com
 *    protecao contra replay via timestamp.
 *  - Fallback `Authorization: Bearer <secret>` para CRMs que nao suportam HMAC.
 *
 * A escolha entre os dois e feita pelos headers presentes na propria
 * requisicao (nao depende de consultar `app_settings` no caminho do
 * webhook, mantendo a verificacao rapida e sem dependencia extra de banco).
 */
export async function verifyWebhookRequest(request: Request, env: Env): Promise<WebhookVerifyResult> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, response: jsonResponse(413, { error: "payload muito grande" }) };
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, response: jsonResponse(413, { error: "payload muito grande" }) };
  }

  const timestampHeader = request.headers.get("x-webhook-timestamp");
  const signatureHeader = request.headers.get("x-webhook-signature");

  if (timestampHeader || signatureHeader) {
    const result = await verifyWebhookSignature({
      secret: env.CRM_WEBHOOK_SECRET,
      rawBody,
      timestampHeader,
      signatureHeader,
    });
    if (!result.ok) {
      return { ok: false, response: jsonResponse(401, { error: `assinatura invalida (${result.reason})` }) };
    }
    return { ok: true, rawBody };
  }

  const authorization = request.headers.get("authorization");
  if (authorization && verifyBearerToken(env.CRM_WEBHOOK_SECRET, authorization)) {
    return { ok: true, rawBody };
  }

  return { ok: false, response: jsonResponse(401, { error: "requisicao nao autenticada" }) };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
