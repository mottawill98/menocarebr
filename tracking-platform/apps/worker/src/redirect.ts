import {
  buildFbc,
  buildWaMeUrl,
  createSupabaseAdmin,
  generateClickRef,
  pickWeightedNumber,
  renderMessageTemplate,
  splitKnownAndExtraParams,
} from "@tracking/shared";
import type { Env, ClickQueueMessage } from "./env.js";
import { getRouteConfig } from "./routes-cache.js";
import { logger } from "./logger.js";

function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match?.[1];
}

function getClientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

const NOT_FOUND_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Link indisponível</title></head><body style="font-family:system-ui;text-align:center;padding:3rem"><h1>Este link não está disponível</h1><p>Verifique se o endereço está correto ou fale com quem enviou o link.</p></body></html>`;

/**
 * Handler do redirect publico: `/r/<slug>`. Este e o caminho mais critico
 * do sistema inteiro — precisa responder o 302 o mais rapido possivel.
 * Nenhum `await` de banco, fila ou Meta acontece antes do `Response.redirect`;
 * tudo que nao e estritamente necessario para montar a URL do WhatsApp roda
 * em `ctx.waitUntil` depois que a resposta ja foi enviada.
 */
export async function handleRedirect(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  slug: string,
  requestId: string
): Promise<Response> {
  const startedAt = Date.now();
  const url = new URL(request.url);

  const config = await getRouteConfig(env, slug, requestId);

  if (!config) {
    ctx.waitUntil(recordRedirectMiss(env, slug, "not_found", request));
    logger.warn({ request_id: requestId, event: "redirect_not_found", slug, duration_ms: Date.now() - startedAt });
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (!config.route.active) {
    ctx.waitUntil(recordRedirectMiss(env, slug, "inactive", request));
    logger.warn({ request_id: requestId, event: "redirect_inactive", slug, duration_ms: Date.now() - startedAt });
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const chosenNumber = pickWeightedNumber(config.numbers);
  if (!chosenNumber) {
    // Rota ativa mas sem nenhum numero ativo vinculado — mesma resposta de
    // fallback, sem inventar um destino.
    ctx.waitUntil(recordRedirectMiss(env, slug, "inactive", request));
    logger.error({ request_id: requestId, event: "redirect_no_active_number", slug, duration_ms: Date.now() - startedAt });
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const clickRef = generateClickRef();
  const { known, extra } = splitKnownAndExtraParams(url.searchParams);

  const message = renderMessageTemplate(config.route.whatsapp_message_template, {
    click_ref: clickRef,
    campaign_name: known.campaign_name,
    ad_name: known.ad_name,
  });

  const waUrl = buildWaMeUrl(chosenNumber.phone, message);

  const clickedAt = new Date().toISOString();
  const fbc = buildFbc(known.fbclid, getCookie(request, "_fbc"));
  const fbp = getCookie(request, "_fbp") ?? null;

  const clickMessage: ClickQueueMessage = {
    click_ref: clickRef,
    route_id: config.route.id,
    whatsapp_number_id: chosenNumber.id,
    clicked_at: clickedAt,
    fbclid: known.fbclid ?? null,
    fbc: fbc ?? null,
    fbp,
    utm_source: known.utm_source ?? null,
    utm_medium: known.utm_medium ?? null,
    utm_campaign: known.utm_campaign ?? null,
    utm_content: known.utm_content ?? null,
    utm_term: known.utm_term ?? null,
    campaign_id: known.campaign_id ?? null,
    campaign_name: known.campaign_name ?? null,
    adset_id: known.adset_id ?? null,
    adset_name: known.adset_name ?? null,
    ad_id: known.ad_id ?? null,
    ad_name: known.ad_name ?? null,
    placement: known.placement ?? null,
    referrer: request.headers.get("referer"),
    client_user_agent: request.headers.get("user-agent"),
    client_ip_address: getClientIp(request),
    extra_params: extra,
  };

  // Fora do caminho critico: enfileira a persistencia e so entao responde.
  ctx.waitUntil(
    env.CLICKS_QUEUE.send(clickMessage).catch((err) => {
      logger.error({
        request_id: requestId,
        event: "clicks_queue_send_failed",
        click_ref: clickRef,
        error: err instanceof Error ? err.message : String(err),
      });
    })
  );

  const durationMs = Date.now() - startedAt;
  logger.info({ request_id: requestId, event: "redirect_ok", slug, click_ref: clickRef, duration_ms: durationMs });

  return Response.redirect(waUrl, 302);
}

async function recordRedirectMiss(env: Env, slug: string, reason: "not_found" | "inactive", request: Request) {
  try {
    const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("redirect_misses").insert({
      slug,
      reason,
      client_ip_address: getClientIp(request),
      client_user_agent: request.headers.get("user-agent"),
    });
  } catch {
    // Falha ao registrar a ocorrencia nao pode virar erro para o usuario —
    // ja respondemos 404 de qualquer forma.
  }
}
