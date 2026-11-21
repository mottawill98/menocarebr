import { describe, expect, it } from "vitest";
import { normalizePhone, phoneHash, phoneLast4 } from "./phone.js";

describe("normalizePhone", () => {
  it("normaliza variacoes do mesmo numero para o mesmo resultado", () => {
    const variants = [
      "(45) 99999-9999",
      "+55 45 99999-9999",
      "5545999999999",
      "055 45 99999-9999",
      "0055 45 99999-9999",
      "45 9 9999-9999",
    ];
    const normalized = variants.map(normalizePhone);
    for (const value of normalized) {
      expect(value).toBe("5545999999999");
    }
  });

  it("mantem numero ja no formato correto", () => {
    expect(normalizePhone("5511988887777")).toBe("5511988887777");
  });

  it("lida com numero de 8 digitos (fixo, sem o 9) com DDD", () => {
    expect(normalizePhone("(45) 3333-4444")).toBe("554533334444");
  });
});

describe("phoneHash", () => {
  it("e consistente para o mesmo numero normalizado", async () => {
    const a = await phoneHash(normalizePhone("(45) 99999-9999"));
    const b = await phoneHash(normalizePhone("+55 45 99999-9999"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produz hashes diferentes para numeros diferentes", async () => {
    const a = await phoneHash(normalizePhone("5545999999999"));
    const b = await phoneHash(normalizePhone("5545888888888"));
    expect(a).not.toBe(b);
  });
});

describe("phoneLast4", () => {
  it("retorna os ultimos 4 digitos", () => {
    expect(phoneLast4("5545999999999")).toBe("9999");
  });
});
