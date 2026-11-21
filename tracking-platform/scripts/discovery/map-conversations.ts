import { mcpGet } from "./client.js";
import { readFileSync, writeFileSync } from "node:fs";

const TAG_PEDIDO_AGENDADO = "c2bb2fe8-8aca-4ede-a94b-a30e15eb8bf0";
const TAKE = 100;
const MAX_PAGES = 60;

function last10(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

async function main() {
  const orders: any[] = JSON.parse(readFileSync("/tmp/agosto-agendado-strict.json", "utf-8"));
  const targetPhones = new Set(orders.map((o) => last10(o.leadPhone)));
  const found = new Map<string, any>();

  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: any = await mcpGet("/api/v1/conversations", { take: TAKE, skip, "filter[tags]": TAG_PEDIDO_AGENDADO });
    const data = res?.data ?? [];
    for (const c of data) {
      const key = last10(c.contact?.contactId ?? "");
      if (targetPhones.has(key) && !found.has(key)) {
        found.set(key, { id: c.id, contactId: c.contact?.contactId, name: c.name, lastMessageDate: c.lastMessageDate });
      }
    }
    console.log(`pagina ${page + 1}: +${data.length}, encontrados ate agora: ${found.size}/${targetPhones.size}`);
    if (data.length < TAKE || found.size === targetPhones.size) break;
    skip += TAKE;
  }

  const result = orders.map((o) => ({ ...o, conversation: found.get(last10(o.leadPhone)) ?? null }));
  writeFileSync("/tmp/agosto-agendado-com-conversa.json", JSON.stringify(result, null, 2));
  console.log(`\nTotal com conversa encontrada: ${result.filter((r) => r.conversation).length}/${result.length}`);
  console.log("Salvo em /tmp/agosto-agendado-com-conversa.json");
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
