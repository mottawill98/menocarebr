import {
  createSupabaseAdmin,
  getRouteWithNumbers,
  routeCacheKey,
  ROUTE_CACHE_TTL_SECONDS,
  sendMetaTestEvent,
  type RouteCacheEntry,
} from "@tracking/shared";
import type { Env } from "./env.js";
import { sendOneMetaEvent } from "./queue/meta-events-consumer.js";
import { jsonResponse } from "./webhooks/verify.js";

/**
 * Rotas privilegiadas server-to-server, chamadas apenas pelo Dashboard
 * (nunca pelo browser do usuario final). Autenticadas com um Bearer token
 * fixo (`INTERNAL_API_TOKEN`) diferente do segredo usado pelo CRM.
 */
export async function handleInternalRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/internal/")) return null;

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_TOKEN}`) {
    return jsonResponse(401, { error: "nao autorizado" });
  }

  if (pathname === "/internal/kv/refresh" && request.method === "POST") {
    return refreshKvCache(request, env);
  }

  if (pathname === "/internal/kv/invalidate" && request.method === "POST") {
    return invalidateKvCache(request, env);
  }

  const resendMatch = pathname.match(/^\/internal\/meta-events\/([^/]+)\/resend$/);
  if (resendMatch && request.method === "POST") {
    return resendMetaEvent(env, resendMatch[1]!);
  }

  if (pathname === "/internal/meta-events/test" && request.method === "POST") {
    return sendTestEvent(env);
  }

  return jsonResponse(404, { error: "rota interna desconhecida" });
}

async function refreshKvCache(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  if (!body?.slug) return jsonResponse(400, { error: "slug obrigatorio" });

  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await getRouteWithNumbers(supabase, body.slug);

  if (!result) {
    await env.ROUTES_KV.delete(routeCacheKey(body.slug));
    return jsonResponse(200, { ok: true, action: "deleted" });
  }

  const entry: RouteCacheEntry = { route: result.route, numbers: result.numbers, cached_at: new Date().toISOString() };
  await env.ROUTES_KV.put(routeCacheKey(body.slug), JSON.stringify(entry), { expirationTtl: ROUTE_CACHE_TTL_SECONDS });

  return jsonResponse(200, { ok: true, action: "refreshed" });
}

async function invalidateKvCache(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  if (!body?.slug) return jsonResponse(400, { error: "slug obrigatorio" });

  await env.ROUTES_KV.delete(routeCacheKey(body.slug));
  return jsonResponse(200, { ok: true });
}

async function resendMetaEvent(env: Env, metaEventId: string): Promise<Response> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  await sendOneMetaEvent(supabase, env, metaEventId);

  const { data: event } = await supabase.from("meta_events").select("status, http_status, error_message").eq("id", metaEventId).maybeSingle();
  return jsonResponse(200, { ok: true, event });
}

async function sendTestEvent(env: Env): Promise<Response> {
  if (!env.META_TEST_EVENT_CODE) {
    return jsonResponse(400, { error: "META_TEST_EVENT_CODE nao configurado" });
  }

  const result = await sendMetaTestEvent(
    { accessToken: env.META_ACCESS_TOKEN, datasetId: env.META_DATASET_ID, graphVersion: env.META_GRAPH_VERSION, graphBaseUrl: env.META_GRAPH_BASE_URL },
    env.META_TEST_EVENT_CODE
  );

  return jsonResponse(result.ok ? 200 : 502, {
    ok: result.ok,
    http_status: result.httpStatus,
    response: result.responseBody,
  });
}
