import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyBearerToken, verifyWebhookSignature } from "./webhook-security.js";

const SECRET = "test-secret-12345";

describe("verifyWebhookSignature", () => {
  it("aceita uma assinatura valida e recente", async () => {
    const body = JSON.stringify({ hello: "world" });
    const { timestamp, signature } = await signWebhookPayload(SECRET, body);

    const result = await verifyWebhookSignature({
      secret: SECRET,
      rawBody: body,
      timestampHeader: timestamp,
      signatureHeader: signature,
    });

    expect(result.ok).toBe(true);
  });

  it("rejeita quando o corpo foi alterado depois de assinado", async () => {
    const { timestamp, signature } = await signWebhookPayload(SECRET, JSON.stringify({ a: 1 }));

    const result = await verifyWebhookSignature({
      secret: SECRET,
      rawBody: JSON.stringify({ a: 2 }),
      timestampHeader: timestamp,
      signatureHeader: signature,
    });

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejeita replay de um timestamp expirado", async () => {
    const body = JSON.stringify({ hello: "world" });
    const oldTimestamp = Math.floor(Date.now() / 1000 - 3600).toString();
    const { signature } = await signWebhookPayload(SECRET, body, oldTimestamp);

    const result = await verifyWebhookSignature({
      secret: SECRET,
      rawBody: body,
      timestampHeader: oldTimestamp,
      signatureHeader: signature,
      toleranceSeconds: 300,
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejeita quando faltam os headers", async () => {
    const result = await verifyWebhookSignature({
      secret: SECRET,
      rawBody: "{}",
      timestampHeader: null,
      signatureHeader: null,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });
});

describe("verifyBearerToken", () => {
  it("aceita o token correto no fallback Bearer", () => {
    expect(verifyBearerToken(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });

  it("rejeita token incorreto", () => {
    expect(verifyBearerToken(SECRET, "Bearer token-errado")).toBe(false);
  });

  it("rejeita header ausente ou mal formado", () => {
    expect(verifyBearerToken(SECRET, null)).toBe(false);
    expect(verifyBearerToken(SECRET, "Basic abc")).toBe(false);
  });
});
