/**
 * Assinatura HMAC-SHA256 dos webhooks do CRM, com protecao contra replay via
 * timestamp. Formato inspirado no Stripe: a assinatura cobre
 * `${timestamp}.${body}`, entao um payload capturado nao pode ser reenviado
 * depois de expirado nem ter o timestamp trocado sem invalidar a assinatura.
 */

const encoder = new TextEncoder();

export interface WebhookSignatureResult {
  timestamp: string;
  signature: string;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp: string = Math.floor(Date.now() / 1000).toString()
): Promise<WebhookSignatureResult> {
  const key = await hmacKey(secret);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return { timestamp, signature: toHex(signed) };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifyWebhookInput {
  secret: string;
  rawBody: string;
  timestampHeader: string | null | undefined;
  signatureHeader: string | null | undefined;
  /** Janela maxima aceita entre o timestamp assinado e agora. Default: 5 minutos. */
  toleranceSeconds?: number;
  now?: number;
}

export type VerifyWebhookResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "invalid_timestamp" | "expired" | "bad_signature" };

export async function verifyWebhookSignature(input: VerifyWebhookInput): Promise<VerifyWebhookResult> {
  const { secret, rawBody, timestampHeader, signatureHeader, toleranceSeconds = 300, now = Date.now() } = input;

  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const ageSeconds = Math.abs(now / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) {
    return { ok: false, reason: "expired" };
  }

  const expected = await signWebhookPayload(secret, rawBody, timestampHeader);
  if (!timingSafeEqual(expected.signature, signatureHeader.toLowerCase())) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true };
}

/**
 * Fallback simples para CRMs que nao suportam HMAC: `Authorization: Bearer
 * <secret>`. Menos seguro (nao protege contra replay nem contra vazamento de
 * log de proxy), por isso so deve ser habilitado explicitamente por rota.
 */
export function verifyBearerToken(secret: string, authorizationHeader: string | null | undefined): boolean {
  if (!authorizationHeader) return false;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  return timingSafeEqual(token, secret);
}
