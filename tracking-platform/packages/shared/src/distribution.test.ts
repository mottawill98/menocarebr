import { describe, expect, it } from "vitest";
import { pickWeightedNumber } from "./distribution.js";
import type { WhatsappNumber } from "./types.js";

function makeNumber(id: string, weight: number, active = true): WhatsappNumber {
  return {
    id,
    label: id,
    phone: "5545999999999",
    active,
    weight,
    group_name: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

describe("pickWeightedNumber", () => {
  it("retorna null quando nao ha numero ativo", () => {
    expect(pickWeightedNumber([makeNumber("a", 10, false)])).toBeNull();
    expect(pickWeightedNumber([])).toBeNull();
  });

  it("nunca escolhe um numero inativo", () => {
    const numbers = [makeNumber("inactive", 100, false), makeNumber("active", 1, true)];
    for (let i = 0; i < 50; i++) {
      expect(pickWeightedNumber(numbers)?.id).toBe("active");
    }
  });

  it("distribui aproximadamente conforme o peso configurado", () => {
    const numbers = [makeNumber("a", 50), makeNumber("b", 30), makeNumber("c", 20)];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const samples = 20_000;

    for (let i = 0; i < samples; i++) {
      const picked = pickWeightedNumber(numbers);
      counts[picked!.id]!++;
    }

    expect(counts.a! / samples).toBeGreaterThan(0.45);
    expect(counts.a! / samples).toBeLessThan(0.55);
    expect(counts.b! / samples).toBeGreaterThan(0.25);
    expect(counts.b! / samples).toBeLessThan(0.35);
    expect(counts.c! / samples).toBeGreaterThan(0.15);
    expect(counts.c! / samples).toBeLessThan(0.25);
  });
});
