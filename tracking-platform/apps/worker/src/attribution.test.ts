import { describe, expect, it } from "vitest";
import { attributeOrder } from "./attribution.js";
import { createFakeSupabase } from "./test/fake-supabase.js";

describe("attributeOrder", () => {
  it("prioriza click_ref quando o clique existe", async () => {
    const supabase = createFakeSupabase({
      clicksByRef: { A7K3M9Q2: { id: "click-1", click_ref: "A7K3M9Q2" } },
      leadBindingsByPhone: { hash123: [{ click_id: "click-2", click_ref: "OUTRO123", bound_at: "2026-01-01T00:00:00Z" }] },
      clicksById: { "click-2": { id: "click-2", clicked_at: "2026-01-01T00:00:00Z" } },
    });

    const result = await attributeOrder(supabase, {
      clickRef: "A7K3M9Q2",
      phoneHash: "hash123",
      orderedAt: new Date("2026-01-02"),
      attributionWindowDays: 30,
    });

    expect(result).toEqual({ clickId: "click-1", clickRef: "A7K3M9Q2", method: "click_ref", status: "attributed" });
  });

  it("cai para phone_hash quando nao ha click_ref valido", async () => {
    const supabase = createFakeSupabase({
      leadBindingsByPhone: { hash123: [{ click_id: "click-2", click_ref: "OUTRO123", bound_at: "2026-01-01T00:00:00Z" }] },
      clicksById: { "click-2": { id: "click-2", clicked_at: "2026-01-01T00:00:00Z" } },
    });

    const result = await attributeOrder(supabase, {
      clickRef: null,
      phoneHash: "hash123",
      orderedAt: new Date("2026-01-02"),
      attributionWindowDays: 30,
    });

    expect(result).toEqual({ clickId: "click-2", clickRef: "OUTRO123", method: "phone_hash", status: "attributed" });
  });

  it("ignora binding fora da janela de atribuicao", async () => {
    const supabase = createFakeSupabase({
      leadBindingsByPhone: { hash123: [{ click_id: "click-2", click_ref: "OUTRO123", bound_at: "2025-01-01T00:00:00Z" }] },
      clicksById: { "click-2": { id: "click-2", clicked_at: "2025-01-01T00:00:00Z" } },
    });

    const result = await attributeOrder(supabase, {
      clickRef: null,
      phoneHash: "hash123",
      orderedAt: new Date("2026-01-02"),
      attributionWindowDays: 30,
    });

    expect(result.status).toBe("unmatched");
  });

  it("retorna unmatched quando nada e encontrado — nunca inventa atribuicao", async () => {
    const supabase = createFakeSupabase({});

    const result = await attributeOrder(supabase, {
      clickRef: "INEXISTENTE",
      phoneHash: "hash-desconhecido",
      orderedAt: new Date("2026-01-02"),
      attributionWindowDays: 30,
    });

    expect(result.status).toBe("unmatched");
    expect(result.method).toBe("unmatched");
    expect(result.clickId).toBeNull();
  });

  it("funciona sem phone_hash (so click_ref)", async () => {
    const supabase = createFakeSupabase({});
    const result = await attributeOrder(supabase, {
      clickRef: null,
      phoneHash: null,
      orderedAt: new Date(),
      attributionWindowDays: 30,
    });
    expect(result.status).toBe("unmatched");
  });
});
