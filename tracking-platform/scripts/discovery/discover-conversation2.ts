import { mcpGet } from "./client.js";
import { writeFileSync } from "node:fs";

const LEAD_ID = "497fd5e9-9176-4680-81a3-eadcd2814c18";
const PHONE = "5532991954578";
const AGENDADO_STAGE_ID = "7cac8bde-1a53-4860-93ef-dea70d74372c";
const TAG_PEDIDO_AGENDADO = "c2bb2fe8-8aca-4ede-a94b-a30e15eb8bf0";

async function main() {
  try {
    const history: any = await mcpGet(`/api/v1/leads/${LEAD_ID}/history`, { take: 20 });
    console.log("===== HISTORY DO LEAD =====");
    console.log(JSON.stringify(history, null, 2).slice(0, 4000));
  } catch (e: any) {
    console.log("history falhou:", e.message);
  }

  try {
    const byStage: any = await mcpGet("/api/v1/conversations", { take: 10, "filter[stages]": AGENDADO_STAGE_ID });
    console.log("\n===== CONVERSATIONS filter[stages]=AGENDADO =====");
    console.log("count:", byStage?.data?.length);
    for (const c of byStage?.data ?? []) {
      console.log(c.id, c.contact?.contactId, c.name, c.lastMessageDate);
    }
    const match = (byStage?.data ?? []).find((c: any) => c.contact?.contactId?.includes(PHONE.slice(-10)));
    if (match) console.log("\nMATCH encontrado para nosso telefone:", match.id);
  } catch (e: any) {
    console.log("filter[stages] falhou:", e.message);
  }

  try {
    const byTag: any = await mcpGet("/api/v1/conversations", { take: 10, "filter[tags]": TAG_PEDIDO_AGENDADO });
    console.log("\n===== CONVERSATIONS filter[tags]=Pedido Agendado =====");
    console.log("count:", byTag?.data?.length);
    for (const c of byTag?.data ?? []) {
      console.log(c.id, c.contact?.contactId, c.name, c.lastMessageDate);
    }
  } catch (e: any) {
    console.log("filter[tags] falhou:", e.message);
  }
}

main().catch((err) => {
  console.error("ERRO GERAL:", err.message ?? err);
  process.exit(1);
});
