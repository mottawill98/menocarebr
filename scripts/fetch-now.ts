/**
 * Retrato atual da conta (só leitura): campanhas, conjuntos e anúncios não arquivados + gasto diário por anúncio
 * dos últimos 10 dias, para decidir os ajustes do dia seguinte.
 * Saída: data/account-analysis/now/*.json (fora do git). Uso: node_modules/.bin/tsx scripts/fetch-now.ts
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const errMsg = (e: unknown): string => (e as { payload?: { error?: { message?: string } } })?.payload?.error?.message ?? (e as Error)?.message ?? String(e);
const OUT = path.join(process.cwd(), "data", "account-analysis", "now");
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const { graphGetAllPages } = await import("../src/lib/meta/client");
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const live = '["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","WITH_ISSUES","IN_PROCESS","PENDING_REVIEW","DISAPPROVED"]';
  const save = (n: string, d: unknown) => {
    fs.writeFileSync(path.join(OUT, `${n}.json`), JSON.stringify(d));
    console.log(`  ${n}: ${Array.isArray(d) ? d.length : "ok"}`);
  };
  save("meta", { today, since, fetchedAt: new Date().toISOString() });
  save("campaigns", await graphGetAllPages(`/${AD_ACCOUNT_ID}/campaigns`, { fields: "id,name,objective,effective_status,daily_budget,bid_strategy,created_time,updated_time", effective_status: live, limit: 200 }));
  save(
    "adsets",
    await graphGetAllPages(`/${AD_ACCOUNT_ID}/adsets`, {
      fields: "id,name,campaign_id,effective_status,daily_budget,optimization_goal,promoted_object,created_time,targeting{age_min,age_max,genders,targeting_automation}",
      effective_status: live,
      limit: 200,
    }),
  );
  save("ads", await graphGetAllPages(`/${AD_ACCOUNT_ID}/ads`, { fields: "id,name,adset_id,campaign_id,effective_status,created_time,creative{id,object_type,video_id}", effective_status: live, limit: 200 }));
  const rows: unknown[] = [];
  for (let d = new Date(`${since}T00:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 3)) {
    const until = new Date(Math.min(d.getTime() + 2 * 864e5, Date.parse(`${today}T00:00:00Z`)));
    rows.push(
      ...(await graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, {
        level: "ad",
        fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,date_start",
        time_range: JSON.stringify({ since: d.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }),
        time_increment: 1,
        limit: 300,
      })),
    );
  }
  save("insights-ad-daily", rows);
  console.log("Pronto.");
}
main().catch((e) => {
  console.error("Falha:", errMsg(e));
  process.exit(1);
});
