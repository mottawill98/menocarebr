import { mcpGet } from "./client.js";

async function main() {
  // Acha o stageId de "Afterpay :: Agendado" varrendo uma amostra.
  let stageId: string | undefined;
  let pipelineId: string | undefined;
  for (let offset = 0; offset < 1000 && !stageId; offset += 100) {
    const page: any = await mcpGet("/api/v1/businesses", { limit: 100, offset });
    const found = (page?.data ?? []).find((b: any) => b.stage?.name === "Agendado" && b.stage?.pipeline?.name === "Afterpay");
    if (found) {
      stageId = found.stageId;
      pipelineId = found.stage.pipeline.id;
    }
    if ((page?.data ?? []).length === 0) break;
  }

  console.log(`stageId "Afterpay :: Agendado" = ${stageId}`);
  console.log(`pipelineId "Afterpay" = ${pipelineId}`);
  if (!stageId) return;

  // Tenta filtrar diretamente por esse stage.
  const filtered: any = await mcpGet("/api/v1/businesses", { limit: 5, stages: stageId });
  console.log(`\n===== GET /api/v1/businesses?stages=${stageId}&limit=5 =====`);
  console.log(JSON.stringify({ total: filtered?.total, count: filtered?.data?.length }, null, 2));

  if (!filtered?.data?.length) {
    // fallback: tenta outro nome de parametro
    const alt: any = await mcpGet("/api/v1/businesses", { limit: 5, stageId });
    console.log(`\n===== fallback ?stageId=${stageId} =====`);
    console.log(JSON.stringify({ total: alt?.total, count: alt?.data?.length }, null, 2));
  }

  const sample = (filtered?.data ?? [])[0];
  if (sample) {
    console.log("\n===== amostra de 1 negocio agendado (campos de topo) =====");
    const { lead, stage, products, ...rest } = sample;
    console.log(JSON.stringify(rest, null, 2));
    console.log("\n-- products --");
    console.log(JSON.stringify(products, null, 2));
    console.log("\n-- lead.sourceReferral / source / phone --");
    console.log(JSON.stringify({ source: lead?.source, sourceReferral: lead?.sourceReferral, phone: lead?.phone }, null, 2));
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
