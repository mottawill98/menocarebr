import type { Env, ClickQueueMessage, MetaEventQueueMessage } from "./env.js";
import { handleRedirect } from "./redirect.js";
import { handleCrmMessageWebhook } from "./webhooks/message.js";
import { handleCrmOrderWebhook } from "./webhooks/order.js";
import { handleHealth } from "./health.js";
import { handleInternalRoute } from "./internal.js";
import { handleScheduled } from "./scheduled.js";
import { processClicksBatch } from "./queue/clicks-consumer.js";
import { processMetaEventsBatch } from "./queue/meta-events-consumer.js";
import { logger, newRequestId } from "./logger.js";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? newRequestId();
    const url = new URL(request.url);

    try {
      // Redirect publico: caminho mais critico do sistema. Nao passa por
      // nenhuma outra logica antes de comecar a montar a resposta.
      const redirectMatch = url.pathname.match(/^\/r\/([a-z0-9-]{2,64})$/);
      if (redirectMatch && request.method === "GET") {
        return await handleRedirect(request, env, ctx, redirectMatch[1]!, requestId);
      }

      if (url.pathname === "/health" && request.method === "GET") {
        return withSecurityHeaders(await handleHealth(env));
      }

      if (url.pathname === "/api/v1/webhooks/crm/message" && request.method === "POST") {
        return withSecurityHeaders(await handleCrmMessageWebhook(request, env, requestId));
      }

      if (url.pathname === "/api/v1/webhooks/crm/order" && request.method === "POST") {
        return withSecurityHeaders(await handleCrmOrderWebhook(request, env, requestId));
      }

      const internalResponse = await handleInternalRoute(request, env, url.pathname);
      if (internalResponse) return withSecurityHeaders(internalResponse);

      return withSecurityHeaders(new Response("not found", { status: 404 }));
    } catch (err) {
      logger.error({
        request_id: requestId,
        event: "unhandled_error",
        path: url.pathname,
        error: err instanceof Error ? err.message : String(err),
      });
      return withSecurityHeaders(new Response(JSON.stringify({ error: "erro interno", request_id: requestId }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }));
    }
  },

  async queue(batch: MessageBatch<ClickQueueMessage | MetaEventQueueMessage>, env: Env): Promise<void> {
    if (batch.queue.startsWith("tracking-clicks")) {
      await processClicksBatch(batch as MessageBatch<ClickQueueMessage>, env);
      return;
    }
    if (batch.queue.startsWith("tracking-meta-events")) {
      await processMetaEventsBatch(batch as MessageBatch<MetaEventQueueMessage>, env);
      return;
    }
    logger.error({ request_id: "queue:unknown", event: "unknown_queue", queue: batch.queue });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
} satisfies ExportedHandler<Env, ClickQueueMessage | MetaEventQueueMessage>;
