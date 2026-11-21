import type { WhatsappNumber } from "./types.js";
import type { RandomBytesSource } from "./click-ref.js";

/**
 * Escolha ponderada de numero de WhatsApp.
 *
 * Decisao de arquitetura: em vez de round-robin com contador persistido
 * (que exigiria coordenacao distribuida entre milhares de instancias de
 * Worker rodando em edges diferentes — exatamente o risco de concorrencia
 * mencionado no briefing do projeto), usamos amostragem ponderada
 * *stateless*: cada requisicao sorteia um numero aleatorio e percorre os
 * pesos acumulados. Isso e trivialmente seguro sob concorrencia (nenhum
 * estado compartilhado, nenhum lock, nenhuma race condition) e converge
 * para a distribuicao proporcional desejada em volume — a diferenca fica
 * dentro da margem de "aproximadamente X%" que o briefing pede.
 */
export function pickWeightedNumber(
  numbers: WhatsappNumber[],
  randomBytes: RandomBytesSource = (n) => {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }
): WhatsappNumber | null {
  const active = numbers.filter((n) => n.active && n.weight > 0);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0]!;

  const totalWeight = active.reduce((sum, n) => sum + n.weight, 0);

  // Sorteia um inteiro uniforme em [0, totalWeight) usando 4 bytes aleatorios.
  const bytes = randomBytes(4);
  const randomUint32 = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  const normalized = (randomUint32 >>> 0) / 0xffffffff;
  let threshold = normalized * totalWeight;

  for (const number of active) {
    threshold -= number.weight;
    if (threshold <= 0) return number;
  }

  // Fallback numerico (arredondamento de ponto flutuante): ultimo ativo.
  return active[active.length - 1]!;
}
