import { createServer } from "node:http";

/**
 * Mock local da Meta Conversions API (item 54). Aponte o Worker para ele em
 * desenvolvimento com `META_GRAPH_BASE_URL=http://localhost:8790` (ver
 * apps/worker/.dev.vars.example) para exercitar todo o fluxo de
 * click -> lead -> pedido -> Purchase sem tocar a API real da Meta.
 *
 * Comportamento configurável via variáveis de ambiente, para testar retry:
 *   MOCK_META_FAIL_RATE=0.3   -> 30% das chamadas retornam HTTP 500
 *   MOCK_META_RATE_LIMIT=1    -> toda chamada retorna HTTP 429
 *   MOCK_META_REJECT_EVENTS=1 -> toda chamada retorna HTTP 400 (erro permanente)
 *
 * Uso: `tsx scripts/mocks/meta-capi-mock.ts`
 */
const PORT = Number(process.env.MOCK_META_PORT ?? 8790);
const FAIL_RATE = Number(process.env.MOCK_META_FAIL_RATE ?? 0);
const RATE_LIMIT = process.env.MOCK_META_RATE_LIMIT === "1";
const REJECT = process.env.MOCK_META_REJECT_EVENTS === "1";

let received = 0;

const server = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/events")) {
    res.writeHead(404).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let payload: { data?: unknown[]; access_token?: string; test_event_code?: string } = {};
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "JSON invalido" } }));
      return;
    }

    // Nunca logamos o access_token, mesmo aqui no mock.
    const { access_token: _accessToken, ...safePayload } = payload;
    void _accessToken;
    console.log(`[meta-capi-mock] POST ${req.url} — ${JSON.stringify(safePayload)}`);

    if (RATE_LIMIT) {
      res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "rate limited (mock)" } }));
      return;
    }

    if (REJECT) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "invalid parameter (mock)" } }));
      return;
    }

    if (Math.random() < FAIL_RATE) {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "internal error (mock)" } }));
      return;
    }

    received += payload.data?.length ?? 0;
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        events_received: payload.data?.length ?? 0,
        messages: [],
        fbtrace_id: `mock-${Date.now()}`,
        ...(payload.test_event_code ? { test_events_result: "ok" } : {}),
      })
    );
  });
});

server.listen(PORT, () => {
  console.log(`[meta-capi-mock] ouvindo em http://localhost:${PORT} (total recebido nesta sessao: ${received})`);
});
