import {
  createSupabaseAdmin,
  getRouteWithNumbers,
  routeCacheKey,
  ROUTE_CACHE_TTL_SECONDS,
  type RouteCacheEntry,
} from "@tracking/shared";
import type { Env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Le a config de uma rota (rota + numeros elegiveis) do KV. Em caso de
 * cache miss, busca no Supabase UMA vez, repopula o KV para as proximas
 * requisicoes, e segue em frente — o redirect nunca fica bloqueado
 * esperando um cache "quente" ser preparado por outro processo.
 *
 * Timeout curto no fallback: se o Supabase estiver lento/fora do ar bem no
 * momento de um cache miss, preferimos falhar rapido (rota tratada como "nao
 * encontrada" para efeitos de latencia) a travar o redirect do usuario.
 */
export async function getRouteConfig(env: Env, slug: string, requestId: string): Promise<RouteCacheEntry | null> {
  const key = routeCacheKey(slug);

  const cached = await env.ROUTES_KV.get<RouteCacheEntry>(key, "json");
  if (cached) return cached;

  logger.info({ request_id: requestId, event: "route_cache_miss", slug });

  try {
    const entry = await withTimeout(fetchRouteFromSupabase(env, slug), 1500);
    if (entry) {
      await env.ROUTES_KV.put(key, JSON.stringify(entry), { expirationTtl: ROUTE_CACHE_TTL_SECONDS });
    }
    return entry;
  } catch (err) {
    logger.error({
      request_id: requestId,
      event: "route_cache_fallback_failed",
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchRouteFromSupabase(env: Env, slug: string): Promise<RouteCacheEntry | null> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await getRouteWithNumbers(supabase, slug);
  if (!result) return null;
  return { route: result.route, numbers: result.numbers, cached_at: new Date().toISOString() };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout apos ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
