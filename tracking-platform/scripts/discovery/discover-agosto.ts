import { mcpGet } from "./client.js";

const AGENDADO_STAGE_ID = "7cac8bde-1a53-4860-93ef-dea70d74372c";
const START = "2026-08-01T00:00:00.000Z";
const END = "2026-08-31T23:59:59.999Z";
const TAKE = 100;
const MAX_PAGES = 80;

async function fetchAllPages(filterField: "lastMovedAfter" | "createdAtGreaterOrEqual", filterFieldEnd: "lastMovedBefore" | "createdAtLessOrEqual") {
  const results: any[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string | number> = {
      take: TAKE,
      skip,
      [`filter[${filterField}]`]: START,
      [`filter[${filterFieldEnd}]`]: END,
    };
    const res: any = await mcpGet("/api/v1/businesses", query);
    const data = res?.data ?? [];
    results.push(...data);
    console.log(`  pagina ${page + 1}: +${data.length} (acumulado ${results.length})`);
    if (data.length < TAKE) break;
    skip += TAKE;
  }
  return results;
}

async function main() {
  console.log("=== Buscando por lastMovedAfter/Before (agosto/2026) ===");
  const byLastMoved = await fetchAllPages("lastMovedAfter", "lastMovedBefore");

  const agendado = byLastMoved.filter((b) => b.stageId === AGENDADO_STAGE_ID);
  console.log(`\nTotal de negocios com lastMovedAt em agosto/2026: ${byLastMoved.length}`);
  console.log(`Total em estagio "Afterpay :: Agendado" dentro desse grupo: ${agendado.length}`);

  const byStatus = new Map<string, number>();
  for (const b of agendado) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
  console.log("Distribuicao de status entre os 'Agendado':", Object.fromEntries(byStatus));

  console.log("\n===== 3 amostras completas =====");
  for (const b of agendado.slice(0, 3)) {
    console.log(JSON.stringify(b, null, 2).slice(0, 3000));
    console.log("---");
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
