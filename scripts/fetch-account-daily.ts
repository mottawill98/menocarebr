/**
 * Insights diários por campanha da conta (só leitura), para curvas de vida da campanha, tendência semanal
 * e dia da semana. Saída: data/account-analysis/insights-campaign-daily.json (fora do git).
 * Uso: node_modules/.bin/tsx scripts/fetch-account-daily.ts
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

async function main() {
  const { graphGetAllPages } = await import("../src/lib/meta/client");
  // Em fatias de 10 dias: pedir o ano inteiro de uma vez estoura o limite de dados da API.
  const rows: unknown[] = [];
  const end = new Date();
  for (const d = new Date("2026-01-01T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 10)) {
    const until = new Date(Math.min(d.getTime() + 9 * 864e5, end.getTime()));
    const page = await graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,date_start",
      time_range: JSON.stringify({ since: d.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }),
      time_increment: 1,
      limit: 200,
    });
    rows.push(...page);
  }
  const out = path.join(process.cwd(), "data", "account-analysis");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "insights-campaign-daily.json"), JSON.stringify(rows));
  console.log(`insights-campaign-daily: ${rows.length} registros`);
}
main().catch((err) => {
  console.error("Falha:", err?.payload?.error?.message ?? err?.message ?? err);
  process.exit(1);
});
