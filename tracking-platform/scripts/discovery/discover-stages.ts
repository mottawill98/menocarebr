import { mcpGet } from "./client.js";

async function main() {
  const stageMap = new Map<string, { pipeline: string; stage: string; count: number }>();
  let offset = 0;
  const limit = 100;
  let total = Infinity;

  while (offset < total && offset < 1000) {
    const page: any = await mcpGet("/api/v1/businesses", { limit, offset });
    const data = page?.data ?? [];
    total = page?.total ?? data.length;
    for (const b of data) {
      const key = `${b.stage?.pipeline?.name ?? "?"} :: ${b.stage?.name ?? "?"}`;
      const entry = stageMap.get(key) ?? { pipeline: b.stage?.pipeline?.name, stage: b.stage?.name, count: 0 };
      entry.count += 1;
      stageMap.set(key, entry);
    }
    if (data.length === 0) break;
    offset += limit;
  }

  console.log(`\n===== Estagios distintos observados (amostra de ate 1000 negocios, total reportado=${total}) =====`);
  for (const [key, v] of [...stageMap.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${v.count.toString().padStart(5)}  ${key}`);
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
