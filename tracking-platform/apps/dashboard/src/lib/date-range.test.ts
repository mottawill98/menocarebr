import { describe, expect, it } from "vitest";
import { previousPeriod, resolveDateRange } from "./date-range";

describe("resolveDateRange", () => {
  it("'hoje' cobre o dia inteiro em America/Sao_Paulo", () => {
    const range = resolveDateRange("today");
    expect(range.from.getTime()).toBeLessThan(range.to.getTime());
  });

  it("'7d' cobre 7 dias", () => {
    const range = resolveDateRange("7d");
    const days = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBeCloseTo(7, 0);
  });

  it("período personalizado usa exatamente o intervalo informado", () => {
    const range = resolveDateRange("custom", { from: "2026-01-01", to: "2026-01-03" });
    expect(range.from.toISOString().startsWith("2026-01-01")).toBe(true);
  });
});

describe("previousPeriod", () => {
  it("retorna um período de mesma duração, imediatamente anterior", () => {
    const range = { from: new Date("2026-01-08T00:00:00Z"), to: new Date("2026-01-15T00:00:00Z") };
    const prev = previousPeriod(range);
    expect(prev.to.getTime()).toBe(range.from.getTime());
    expect(prev.to.getTime() - prev.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
  });
});
