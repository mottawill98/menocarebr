/**
 * Normalizacao de telefone. Precisa ser EXATAMENTE a mesma funcao em todos os
 * lugares (redirect, webhook de mensagem, webhook de pedido, envio pra Meta)
 * para que `(45) 99999-9999`, `+55 45 99999-9999` e `5545999999999` sempre
 * produzam o mesmo `phone_hash`.
 *
 * Regra adotada (Brasil-first, mas generica o suficiente pra outros paises):
 * 1. Remove tudo que nao for digito.
 * 2. Remove um zero de discagem internacional inicial (00) se presente.
 * 3. Se o numero nao comecar com o codigo do pais e tiver 10 ou 11 digitos
 *    (padrao BR: DDD + numero, com ou sem o 9 extra), assume Brasil e
 *    prefixa 55.
 * 4. Resultado final: apenas digitos, com codigo do pais, sem `+`, sem
 *    zeros a esquerda — o mesmo formato que a Meta exige para o campo `ph`
 *    antes do hash (e o mesmo formato E.164 "compacto" usado no `wa.me`).
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  // Prefixo internacional de discagem (00 55 45 99999 9999).
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Zero de tronco antes do DDD (0 45 99999 9999) quando ainda nao tem o 55.
  if (!digits.startsWith("55") && digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // Numero brasileiro sem o 55: DDD (2) + numero (8 ou 9 digitos).
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  // Remove zeros a esquerda remanescentes (Meta CAPI exige isso antes do hash).
  digits = digits.replace(/^0+/, "");

  return digits;
}

export function phoneLast4(normalized: string): string {
  return normalized.slice(-4);
}

/**
 * SHA-256 do telefone normalizado, em hex minusculo. Usa Web Crypto
 * (`crypto.subtle`), disponivel tanto no Cloudflare Workers quanto no
 * Node.js 20+, para manter o pacote isomorfico.
 */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function phoneHash(normalized: string): Promise<string> {
  return sha256Hex(normalized);
}

/** Monta a URL `wa.me/<telefone>` a partir do telefone ja normalizado. */
export function buildWaMeUrl(normalizedPhone: string, text?: string): string {
  const url = new URL(`https://wa.me/${normalizedPhone}`);
  if (text) url.searchParams.set("text", text);
  return url.toString();
}
