import type { Route, WhatsappNumber } from "./types.js";

/**
 * Formato do valor cacheado no Cloudflare KV para cada rota. Compartilhado
 * entre o Worker (le no redirect) e o Dashboard (escreve/invalida quando um
 * ADMIN/MANAGER edita rota, numero ou vinculo — ver item 49 do briefing).
 */
export interface RouteCacheEntry {
  route: Route;
  numbers: WhatsappNumber[];
  cached_at: string;
}

export function routeCacheKey(slug: string): string {
  return `route:${slug}`;
}

/** TTL de seguranca: mesmo se uma invalidacao explicita falhar, o cache se auto-corrige em no maximo 5 minutos. */
export const ROUTE_CACHE_TTL_SECONDS = 300;
