import { mcpGet } from "./client.js";

const TAG_PEDIDO_AGENDADO = "c2bb2fe8-8aca-4ede-a94b-a30e15eb8bf0";
const AGENDADO_STAGE_ID = "7cac8bde-1a53-4860-93ef-dea70d74372c";

async function main() {
  const res: any = await mcpGet("/api/v1/businesses", {
    take: 20,
    skip: 0,
    "filter[tags]": TAG_PEDIDO_AGENDADO,
  });
  console.log("total (campo bruto, nao confiavel como contagem):", res?.total);
  console.log("count retornado:", res?.data?.length);
  const stages = new Map<string, number>();
  for (const b of res?.data ?? []) {
    const key = `${b.stage?.pipeline?.name} :: ${b.stage?.name}`;
    stages.set(key, (stages.get(key) ?? 0) + 1);
  }
  console.log("estagios encontrados entre os marcados com a tag:", Object.fromEntries(stages));

  // Agora combinado com filtro de data de agosto (lastMovedAfter/Before)
  const resAug: any = await mcpGet("/api/v1/businesses", {
    take: 20,
    skip: 0,
    "filter[tags]": TAG_PEDIDO_AGENDADO,
    "filter[lastMovedAfter]": "2026-08-01T00:00:00.000Z",
    "filter[lastMovedBefore]": "2026-08-31T23:59:59.999Z",
  });
  console.log("\ncom filtro de data agosto -> count:", resAug?.data?.length);
  console.log("primeiro lastMovedAt:", resAug?.data?.[0]?.lastMovedAt);
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
