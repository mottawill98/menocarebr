/**
 * Constroi o valor de `fbc` a partir do `fbclid` da URL, no formato que a
 * Meta usa para o cookie `_fbc`: `fb.<subdomainIndex>.<creationTime>.<fbclid>`.
 * Formato documentado ha varios anos pela Meta para reconstrucao server-side
 * do `_fbc` quando o clique nao passa por um pixel no browser (nosso caso,
 * ja que o redirect vai direto pro WhatsApp sem carregar o Pixel — ver
 * item 60 do briefing do projeto). `subdomainIndex` fixo em `1` (dominio
 * proprio, sem subdominios de terceiro nivel relevantes para o calculo).
 *
 * Se ja existir um `_fbc` legitimo (cookie do browser), ele tem prioridade
 * sobre o que construimos aqui.
 */
export function buildFbc(fbclid: string | undefined | null, existingFbc?: string | null, at: number = Date.now()): string | undefined {
  if (existingFbc) return existingFbc;
  if (!fbclid) return undefined;
  return `fb.1.${at}.${fbclid}`;
}
