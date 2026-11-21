/**
 * Gera o `click_ref`: identificador curto e publico que substitui o papel que
 * o `ctwa_clid` teria caso os numeros usassem WhatsApp Business Platform.
 *
 * Alfabeto sem caracteres ambiguos (sem 0/O, 1/I/L) para reduzir erro de
 * transcricao manual quando o cliente le o codigo na conversa do WhatsApp.
 */
export const CLICK_REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CLICK_REF_LENGTH = 8;

// Regex publica usada tanto na validacao de entrada quanto na extracao do
// codigo dentro do texto livre de uma mensagem recebida pelo CRM.
export const CLICK_REF_PATTERN = new RegExp(
  `[${CLICK_REF_ALPHABET}]{${CLICK_REF_LENGTH}}`,
  "g"
);

export interface RandomBytesSource {
  (length: number): Uint8Array;
}

const defaultRandomBytes: RandomBytesSource = (length) => {
  const bytes = new Uint8Array(length);
  // `crypto.getRandomValues` esta disponivel tanto no runtime dos Cloudflare
  // Workers quanto no Node.js 20+ (globalThis.crypto), mantendo este pacote
  // isomorfico sem depender de `node:crypto`.
  crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Gera um `click_ref` usando amostragem por rejeicao para evitar o viés de
 * modulo (256 nao e multiplo exato do tamanho do alfabeto).
 */
export function generateClickRef(randomBytes: RandomBytesSource = defaultRandomBytes): string {
  const alphabetLength = CLICK_REF_ALPHABET.length;
  const maxUnbiased = Math.floor(256 / alphabetLength) * alphabetLength;
  let result = "";

  while (result.length < CLICK_REF_LENGTH) {
    const batch = randomBytes(CLICK_REF_LENGTH - result.length);
    for (const byte of batch) {
      if (result.length >= CLICK_REF_LENGTH) break;
      if (byte >= maxUnbiased) continue;
      result += CLICK_REF_ALPHABET[byte % alphabetLength];
    }
  }

  return result;
}

export function isValidClickRef(value: string): boolean {
  return new RegExp(`^[${CLICK_REF_ALPHABET}]{${CLICK_REF_LENGTH}}$`).test(value);
}

/**
 * Procura ocorrencias de `#CLICKREF` (ou o codigo puro) dentro de um texto
 * livre, como a primeira mensagem recebida no WhatsApp. Retorna o primeiro
 * candidato valido encontrado, ou `null` se nenhum for reconhecido.
 *
 * O cliente pode digitar o codigo com ou sem `#`, em minusculas, ou colado
 * junto com outras palavras — por isso normalizamos para maiusculas antes de
 * varrer o alfabeto valido.
 */
export function extractClickRefFromMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const upper = message.toUpperCase();
  const matches = upper.match(CLICK_REF_PATTERN);
  if (!matches || matches.length === 0) return null;
  // Se houver mais de um candidato, prioriza o que vem logo apos um `#`.
  const withHash = upper.match(new RegExp(`#([${CLICK_REF_ALPHABET}]{${CLICK_REF_LENGTH}})`));
  if (withHash) return withHash[1] ?? null;
  return matches[0] ?? null;
}
