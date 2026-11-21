import { mcpGet } from "./client.js";
import { writeFileSync } from "node:fs";

const LEAD_ID = "497fd5e9-9176-4680-81a3-eadcd2814c18"; // Alexandra Rodrigues Ribeiro
const PHONE = "5532991954578";

async function main() {
  const lead: any = await mcpGet(`/api/v1/leads/${LEAD_ID}`);
  console.log("===== LEAD COMPLETO =====");
  console.log(JSON.stringify(lead, null, 2));

  console.log("\n===== BUSCA DE CONVERSA POR TELEFONE (search) =====");
  const convBySearch: any = await mcpGet("/api/v1/conversations", { take: 5, search: PHONE });
  console.log(JSON.stringify(convBySearch, null, 2).slice(0, 3000));

  const conv = convBySearch?.data?.[0];
  if (conv?.id) {
    writeFileSync("/tmp/conv-sample.json", JSON.stringify(conv, null, 2));
    const messages: any = await mcpGet(`/api/v1/conversations/${conv.id}/messages`, { take: 50 });
    writeFileSync("/tmp/messages-sample.json", JSON.stringify(messages, null, 2));
    console.log(`\nConversa encontrada: ${conv.id} | mensagens: ${messages?.data?.length ?? messages?.length}`);
  } else {
    console.log("\nNENHUMA conversa encontrada via search por telefone.");
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
