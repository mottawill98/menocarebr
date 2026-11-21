/**
 * Insights diários por anúncio de toda a conta (só leitura), guardando só gasto e compras na Meta por dia.
 * Serve para medir a capacidade de gasto de cada criativo e o CPA recente.
 * Saída: data/account-analysis/insights-ad-daily.json (fora do git).
 * Uso: node_modules/.bin/tsx scripts/fetch-creatives-daily.ts
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const PURCHASE = "onsite_conversion.purchase";

async function main() {
  const { graphGetAllPages } = await import("../src/lib/meta/client");
  const rows: { ad_id: string; ad_name: string; date: string; spend: number; purchases: number }[] = [];
  const end = new Date();
  for (const d = new Date("2026-01-01T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    const until = new Date(Math.min(d.getTime() + 6 * 864e5, end.getTime()));
    const page = await graphGetAllPages<{ ad_id: string; ad_name: string; spend: string; date_start: string; actions?: { action_type: string; value: string }[] }>(
      `/${AD_ACCOUNT_ID}/insights`,
      {
        level: "ad",
        fields: "ad_id,ad_name,spend,actions,date_start",
        time_range: JSON.stringify({ since: d.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }),
        time_increment: 1,
        limit: 300,
      },
    );
    for (const r of page) rows.push({ ad_id: r.ad_id, ad_name: r.ad_name, date: r.date_start, spend: Number(r.spend), purchases: Number(r.actions?.find((a) => a.action_type === PURCHASE)?.value ?? 0) });
    console.log(`  ${d.toISOString().slice(0, 10)}: ${rows.length} linhas`);
  }
  fs.writeFileSync(path.join(process.cwd(), "data", "account-analysis", "insights-ad-daily.json"), JSON.stringify(rows));
  console.log(`insights-ad-daily: ${rows.length} registros`);
}
main().catch((err) => {
  console.error("Falha:", err?.payload?.error?.message ?? err?.message ?? err);
  process.exit(1);
});
