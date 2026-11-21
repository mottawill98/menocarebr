import type { Env } from "./env.js";

/**
 * Rate limit basico por janela fixa, usando KV como contador. E "razoavel"
 * (nao perfeitamente atomico sob concorrencia extrema — KV e eventualmente
 * consistente), suficiente como camada de defesa de aplicacao para os
 * webhooks do CRM. Para protecao mais rigorosa, configure tambem uma regra
 * de Rate Limiting nativa do Cloudflare na zona (ver docs/SECURITY.md).
 */
export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const kvKey = `ratelimit:${key}:${windowBucket}`;

  const current = Number((await env.ROUTES_KV.get(kvKey)) ?? "0");
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await env.ROUTES_KV.put(kvKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return { allowed: true, remaining: Math.max(0, limit - current - 1) };
}
