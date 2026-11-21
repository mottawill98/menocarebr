import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("gera cabecalho e linhas na ordem das colunas", () => {
    const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }], ["a", "b"]);
    expect(csv).toBe("a,b\n1,x\n2,y");
  });

  it("escapa valores com vírgula, aspas ou quebra de linha", () => {
    const csv = toCsv([{ nome: 'Diz "oi", tchau\nlinha2' }], ["nome"]);
    expect(csv).toBe('nome\n"Diz ""oi"", tchau\nlinha2"');
  });

  it("trata null/undefined como célula vazia", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b"]);
    expect(csv).toBe("a,b\n,");
  });
});
