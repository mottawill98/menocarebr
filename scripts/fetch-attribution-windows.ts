/**
 * Compras na Meta por janela de atribuição (clique 1d, clique 7d, visualização 1d) por anúncio (só leitura).
 * Serve para ver se algum tipo de criativo recebe crédito principalmente por visualização.
 * Saída: data/account-analysis/ad-attribution-windows.json (fora do git).
 * Uso: node_modules/.bin/tsx scripts/fetch-attribution-windows.ts
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const PURCHASE = "onsite_conversion.purchase";
const errMsg = (e: unknown): string => (e as { payload?: { error?: { message?: string } } })?.payload?.error?.message ?? (e as Error)?.message ?? String(e);

interface Row {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: string;
  actions?: { action_type: string; value: string; "1d_click"?: string; "7d_click"?: string; "1d_view"?: string }[];
}

async function main() {
  const { graphGetAllPages } = await import("../src/lib/meta/client");
  const out: { ad_id: string; ad_name: string; campaign_id: string; campaign_name: string; spend: number; total: number; click1d: number; click7d: number; view1d: number }[] = [];
  const ranges = [
    ["2026-08-10", "2026-09-09"],
    ["2026-09-10", "2026-10-10"],
    ["2026-10-11", "2026-11-10"],
  ];
  for (const [since, until] of ranges) {
    const rows = await graphGetAllPages<Row>(`/${AD_ACCOUNT_ID}/insights`, {
      level: "ad",
      fields: "ad_id,ad_name,campaign_id,campaign_name,spend,actions",
      action_attribution_windows: JSON.stringify(["1d_click", "7d_click", "1d_view"]),
      time_range: JSON.stringify({ since, until }),
      limit: 300,
    });
    for (const r of rows) {
      const a = r.actions?.find((x) => x.action_type === PURCHASE);
      out.push({
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        spend: Number(r.spend),
        total: Number(a?.value ?? 0),
        click1d: Number(a?.["1d_click"] ?? 0),
        click7d: Number(a?.["7d_click"] ?? 0),
        view1d: Number(a?.["1d_view"] ?? 0),
      });
    }
    console.log(`  ${since} a ${until}: ${rows.length} linhas`);
  }
  fs.writeFileSync(path.join(process.cwd(), "data", "account-analysis", "ad-attribution-windows.json"), JSON.stringify(out));
  console.log(`ad-attribution-windows: ${out.length} registros`);
}
main().catch((err) => {
  console.error("Falha:", errMsg(err));
  process.exit(1);
});
