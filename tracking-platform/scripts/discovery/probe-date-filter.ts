import { mcpGet } from "./client.js";

async function main() {
  const unfiltered: any = await mcpGet("/api/v1/businesses", { take: 1, skip: 0 });
  console.log("unfiltered total:", unfiltered?.total, "| first createdAt:", unfiltered?.data?.[0]?.createdAt);

  const aug: any = await mcpGet("/api/v1/businesses", {
    take: 1,
    skip: 0,
    "filter[lastMovedAfter]": "2026-08-01T00:00:00.000Z",
    "filter[lastMovedBefore]": "2026-08-31T23:59:59.999Z",
  });
  console.log("lastMoved-aug total:", aug?.total, "| first createdAt:", aug?.data?.[0]?.createdAt, "| first lastMovedAt:", aug?.data?.[0]?.lastMovedAt);

  const augCreated: any = await mcpGet("/api/v1/businesses", {
    take: 1,
    skip: 0,
    "filter[createdAtGreaterOrEqual]": "2026-08-01T00:00:00.000Z",
    "filter[createdAtLessOrEqual]": "2026-08-31T23:59:59.999Z",
  });
  console.log("created-aug total:", augCreated?.total, "| first createdAt:", augCreated?.data?.[0]?.createdAt);
}

main().catch((err) => {
  console.error("ERRO:", err.message ?? err);
  process.exit(1);
});
