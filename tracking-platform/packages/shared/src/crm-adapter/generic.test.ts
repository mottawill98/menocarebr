import { describe, expect, it } from "vitest";
import { normalizeGenericCrmMessage, normalizeGenericCrmOrder, sanitizeMetadata } from "./generic.js";

describe("normalizeGenericCrmMessage", () => {
  it("extrai telefone e mensagem de payloads com nomes de campo comuns", () => {
    expect(normalizeGenericCrmMessage({ phone: "5545999999999", message: "oi #A7K3M9Q2" })).toMatchObject({
      phone_raw: "5545999999999",
      message: "oi #A7K3M9Q2",
    });

    expect(normalizeGenericCrmMessage({ telephone: "5545999999999", text: "oi" })).toMatchObject({
      phone_raw: "5545999999999",
      message: "oi",
    });
  });

  it("lanca erro quando nao ha telefone reconhecivel", () => {
    expect(() => normalizeGenericCrmMessage({ message: "oi" })).toThrow();
  });
});

describe("normalizeGenericCrmOrder", () => {
  it("normaliza um pedido com click_ref explicito", () => {
    const order = normalizeGenericCrmOrder({
      order_id: "58472",
      phone: "5545999999999",
      status: "paid",
      value: "390.00",
      currency: "brl",
      click_ref: "A7K3M9Q2",
    });

    expect(order).toMatchObject({
      crm_order_id: "58472",
      phone_raw: "5545999999999",
      status: "paid",
      value: 390,
      currency: "BRL",
      click_ref: "A7K3M9Q2",
    });
  });

  it("lanca erro sem identificador de pedido", () => {
    expect(() => normalizeGenericCrmOrder({ status: "paid", value: 100 })).toThrow();
  });
});

describe("sanitizeMetadata", () => {
  it("remove campos sensiveis mas preserva o resto", () => {
    const clean = sanitizeMetadata({ order_id: "1", token: "secret", access_token: "secret2", note: "ok" });
    expect(clean).toEqual({ order_id: "1", note: "ok" });
  });
});
