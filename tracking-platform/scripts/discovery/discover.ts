import { mcpGet } from "./client.js";

function dump(label: string, data: unknown, max = 4000) {
  const json = JSON.stringify(data, null, 2);
  console.log(`\n===== ${label} =====`);
  console.log(json.length > max ? json.slice(0, max) + `\n...[truncado, ${json.length} chars]` : json);
}

async function main() {
  const pipelines = await mcpGet("/api/v1/pipelines");
  dump("GET /api/v1/pipelines", pipelines);

  const businesses = await mcpGet("/api/v1/businesses", { limit: 3 });
  dump("GET /api/v1/businesses?limit=3", businesses);

  const leads = await mcpGet("/api/v1/leads", { limit: 3 });
  dump("GET /api/v1/leads?limit=3", leads);

  const conversations = await mcpGet("/api/v1/conversations", { limit: 3 });
  dump("GET /api/v1/conversations?limit=3", conversations);

  const conv = (conversations as any)?.data?.[0] ?? (conversations as any)?.[0];
  if (conv?.id) {
    const messages = await mcpGet(`/api/v1/conversations/${conv.id}/messages`, { limit: 20 });
    dump(`GET /api/v1/conversations/${conv.id}/messages?limit=20`, messages);
  } else {
    console.log("\n(nenhuma conversa encontrada para inspecionar mensagens)");
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
