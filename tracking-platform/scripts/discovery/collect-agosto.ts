import { mcpGet } from "./client.js";
import { writeFileSync } from "node:fs";

const TAG_PEDIDO_AGENDADO = "c2bb2fe8-8aca-4ede-a94b-a30e15eb8bf0";
const AGENDADO_STAGE_ID = "7cac8bde-1a53-4860-93ef-dea70d74372c";
const START = "2026-08-01T00:00:00.000Z";
const END = "2026-08-31T23:59:59.999Z";
const TAKE = 100;
const MAX_PAGES = 100;

async function main() {
  const all: any[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: any = await mcpGet("/api/v1/businesses", {
      take: TAKE,
      skip,
      "filter[tags]": TAG_PEDIDO_AGENDADO,
      "filter[lastMovedAfter]": START,
      "filter[lastMovedBefore]": END,
    });
    const data = res?.data ?? [];
    all.push(...data);
    console.log(`pagina ${page + 1}: +${data.length} (acumulado ${all.length})`);
    if (data.length < TAKE) break;
    skip += TAKE;
  }

  const stageBreakdown = new Map<string, number>();
  for (const b of all) {
    const key = `${b.stage?.pipeline?.name} :: ${b.stage?.name}`;
    stageBreakdown.set(key, (stageBreakdown.get(key) ?? 0) + 1);
  }
  console.log("\nTotal (tag Pedido Agendado, lastMovedAt=agosto):", all.length);
  console.log("Distribuicao por estagio:", Object.fromEntries(stageBreakdown));

  const agendadoOnly = all.filter((b) => b.stageId === AGENDADO_STAGE_ID);
  console.log(`\nSomente estagio "Agendado" (definicao estrita): ${agendadoOnly.length}`);

  writeFileSync("/tmp/agosto-agendado-raw.json", JSON.stringify(all, null, 2));
  writeFileSync(
    "/tmp/agosto-agendado-strict.json",
    JSON.stringify(
      agendadoOnly.map((b) => ({
        businessId: b.id,
        code: b.code,
        externalId: b.externalId,
        leadId: b.leadId,
        attendantId: b.attendantId,
        attendantName: b.attendant?.name,
        status: b.status,
        total: b.total,
        createdAt: b.createdAt,
        lastMovedAt: b.lastMovedAt,
        products: b.products?.map((p: any) => p.product?.name),
        leadName: b.lead?.name,
        leadPhone: b.lead?.phone,
      })),
      null,
      2,
    ),
  );
  console.log("\nSalvo em /tmp/agosto-agendado-raw.json e /tmp/agosto-agendado-strict.json");
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
