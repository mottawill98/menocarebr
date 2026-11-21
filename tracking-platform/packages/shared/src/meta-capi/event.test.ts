import { describe, expect, it } from "vitest";
import { buildPurchaseEvent, buildPurchaseEventId } from "./event.js";
import { hashUserDataField } from "./hash.js";

describe("buildPurchaseEventId", () => {
  it("e estavel e identico para o mesmo crm_order_id", () => {
    expect(buildPurchaseEventId("58472")).toBe(buildPurchaseEventId("58472"));
    expect(buildPurchaseEventId("58472")).toBe("purchase:58472");
  });

  it("difere para pedidos diferentes", () => {
    expect(buildPurchaseEventId("1")).not.toBe(buildPurchaseEventId("2"));
  });
});

describe("buildPurchaseEvent", () => {
  it("hasheia o telefone e mantem fbc/fbp/ip/user-agent em texto puro", async () => {
    const event = await buildPurchaseEvent({
      crmOrderId: "58472",
      eventTime: new Date("2026-09-17T12:00:00Z"),
      value: 390,
      currency: "BRL",
      normalizedPhone: "5545999999999",
      fbc: "fb.1.123.abc",
      fbp: "fb.1.456.def",
      clientIpAddress: "203.0.113.1",
      clientUserAgent: "Mozilla/5.0",
    });

    const expectedHash = await hashUserDataField("5545999999999");
    const purchaseEvent = event.data[0]!;

    expect(purchaseEvent.user_data.ph).toBe(expectedHash);
    expect(purchaseEvent.user_data.fbc).toBe("fb.1.123.abc");
    expect(purchaseEvent.user_data.fbp).toBe("fb.1.456.def");
    expect(purchaseEvent.user_data.client_ip_address).toBe("203.0.113.1");
    expect(purchaseEvent.user_data.client_user_agent).toBe("Mozilla/5.0");
  });

  it("nunca inclui o access_token no payload", async () => {
    const event = await buildPurchaseEvent({
      crmOrderId: "1",
      eventTime: new Date(),
      value: 10,
      currency: "BRL",
    });
    expect(JSON.stringify(event)).not.toContain("access_token");
  });

  it("usa action_source = chat (numeros sem WhatsApp Business Platform)", async () => {
    const event = await buildPurchaseEvent({ crmOrderId: "1", eventTime: new Date(), value: 10, currency: "BRL" });
    expect(event.data[0]!.action_source).toBe("chat");
  });

  it("inclui test_event_code somente quando fornecido", async () => {
    const withCode = await buildPurchaseEvent({
      crmOrderId: "1",
      eventTime: new Date(),
      value: 10,
      currency: "BRL",
      testEventCode: "TEST123",
    });
    expect(withCode.test_event_code).toBe("TEST123");

    const withoutCode = await buildPurchaseEvent({ crmOrderId: "1", eventTime: new Date(), value: 10, currency: "BRL" });
    expect(withoutCode.test_event_code).toBeUndefined();
  });
});
