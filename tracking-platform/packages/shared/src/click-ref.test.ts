import { describe, expect, it } from "vitest";
import { CLICK_REF_LENGTH, extractClickRefFromMessage, generateClickRef, isValidClickRef } from "./click-ref.js";

describe("generateClickRef", () => {
  it("gera codigos com o tamanho e alfabeto esperados", () => {
    const ref = generateClickRef();
    expect(ref).toHaveLength(CLICK_REF_LENGTH);
    expect(isValidClickRef(ref)).toBe(true);
    expect(ref).not.toMatch(/[0O1IL]/);
  });

  it("gera codigos praticamente unicos em lote", () => {
    const refs = new Set(Array.from({ length: 5000 }, () => generateClickRef()));
    // Com 31^8 combinacoes possiveis, 5000 amostras devem ser todas unicas.
    expect(refs.size).toBe(5000);
  });
});

describe("extractClickRefFromMessage", () => {
  it("encontra o click_ref precedido de #", () => {
    const ref = generateClickRef();
    expect(extractClickRefFromMessage(`Olá, gostaria de saber mais\n#${ref}`)).toBe(ref);
  });

  it("encontra o click_ref mesmo em minusculas", () => {
    const ref = generateClickRef();
    expect(extractClickRefFromMessage(`oi #${ref.toLowerCase()}`)).toBe(ref);
  });

  it("retorna null quando o cliente apaga o click_ref", () => {
    expect(extractClickRefFromMessage("Olá, gostaria de saber mais sobre o produto")).toBeNull();
  });

  it("retorna null para mensagem vazia", () => {
    expect(extractClickRefFromMessage(undefined)).toBeNull();
    expect(extractClickRefFromMessage(null)).toBeNull();
    expect(extractClickRefFromMessage("")).toBeNull();
  });
});
