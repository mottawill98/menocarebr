/**
 * Leitor mínimo de .xlsx (primeira planilha), sem dependências: usa o `unzip`
 * do sistema e lê o XML. Devolve linhas como objetos {cabeçalho: valor}.
 * Suporta strings compartilhadas, texto inline e números; ignora fórmulas/estilos.
 */
import { execFileSync } from "node:child_process";

const unzip = (file: string, entry: string): string | null => {
  try {
    return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** "AK" → 36 (índice a partir de 0). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(file: string): Record<string, string>[] {
  const sheet = unzip(file, "xl/worksheets/sheet1.xml");
  if (sheet === null) throw new Error(`Não consegui ler a planilha em ${file} (precisa do comando "unzip").`);

  const shared: string[] = [];
  const sharedXml = unzip(file, "xl/sharedStrings.xml");
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(decode([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
    }
  }

  const table: string[][] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      let value = "";
      if (type === "inlineStr") value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : decode(v);
      }
      cells[columnIndex(ref)] = value;
    }
    table.push(cells);
  }

  const header = (table.shift() ?? []).map((h) => (h ?? "").trim());
  return table
    .filter((r) => r.some((v) => v))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
