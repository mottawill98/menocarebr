import { describe, expect, it, vi } from "vitest";
import { sendMetaEvent } from "./client.js";
import type { MetaEventPayload } from "./event.js";

const config = { accessToken: "fake-token", datasetId: "123", graphVersion: "v21.0" };
const payload: MetaEventPayload = {
  data: [
    {
      event_name: "Purchase",
      event_time: 1,
      event_id: "purchase:1",
      action_source: "chat",
      user_data: {},
      custom_data: { currency: "BRL", value: 10 },
    },
  ],
};

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("sendMetaEvent", () => {
  it("retorna ok=true em respostas 2xx", async () => {
    const result = await sendMetaEvent(config, payload, mockFetch(200, { events_received: 1 }));
    expect(result.ok).toBe(true);
    expect(result.isPermanentError).toBe(false);
  });

  it("classifica HTTP 500 como erro retentavel", async () => {
    const result = await sendMetaEvent(config, payload, mockFetch(500, { error: "server error" }));
    expect(result.ok).toBe(false);
    expect(result.isPermanentError).toBe(false);
  });

  it("classifica HTTP 429 como erro retentavel", async () => {
    const result = await sendMetaEvent(config, payload, mockFetch(429, { error: "rate limited" }));
    expect(result.ok).toBe(false);
    expect(result.isPermanentError).toBe(false);
  });

  it("classifica HTTP 400 como erro permanente (vai para failed/dead-letter)", async () => {
    const result = await sendMetaEvent(config, payload, mockFetch(400, { error: { message: "invalid parameter" } }));
    expect(result.ok).toBe(false);
    expect(result.isPermanentError).toBe(true);
  });

  it("trata erro de rede como retentavel e nunca lanca excecao", async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await sendMetaEvent(config, payload, failingFetch);
    expect(result.ok).toBe(false);
    expect(result.isPermanentError).toBe(false);
  });

  it("nunca inclui o access_token na resposta retornada", async () => {
    const result = await sendMetaEvent(config, payload, mockFetch(200, { events_received: 1 }));
    expect(JSON.stringify(result)).not.toContain(config.accessToken);
  });
});
