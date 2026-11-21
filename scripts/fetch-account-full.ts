/**
 * Baixa o histórico COMPLETO da conta de anúncios (só leitura, chamadas GET à Graph API) para análise:
 * campanhas, conjuntos e anúncios (todos os status), insights por mês/campanha, por conjunto, por anúncio
 * e quebras da conta (idade/gênero, posicionamento, estado, dispositivo).
 *
 * Uso: node_modules/.bin/tsx scripts/fetch-account-full.ts
 * Saída: data/account-analysis/*.json (a pasta data/ não vai para o git). O token é lido do .env.local
 * e nunca é impresso.
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

async function main() {
  const { graphGetAllPages, graphGet } = await import("../src/lib/meta/client");
  const out = path.join(process.cwd(), "data", "account-analysis");
  fs.mkdirSync(out, { recursive: true });
  const acc = AD_ACCOUNT_ID;
  const statuses = '["ACTIVE","PAUSED","ARCHIVED","IN_PROCESS","WITH_ISSUES","CAMPAIGN_PAUSED","ADSET_PAUSED","PENDING_REVIEW","DISAPPROVED"]';
  const range = JSON.stringify({ since: "2026-01-01", until: new Date().toISOString().slice(0, 10) });
  const save = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data));
    console.log(`  ${name}: ${Array.isArray(data) ? data.length : 1} registros`);
  };

  console.log("Conta");
  save("account", await graphGet(`/${acc}`, { fields: "name,account_status,currency,timezone_name,amount_spent,created_time,business_name" }));

  console.log("Entidades");
  save(
    "campaigns",
    await graphGetAllPages(`/${acc}/campaigns`, {
      fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,buying_type,created_time,start_time,stop_time,special_ad_categories",
      effective_status: statuses,
      limit: 200,
    }),
  );
  save(
    "adsets",
    await graphGetAllPages(`/${acc}/adsets`, {
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,destination_type,promoted_object,created_time," +
        "targeting{age_min,age_max,genders,geo_locations{countries},publisher_platforms,facebook_positions,instagram_positions,device_platforms,targeting_automation}",
      effective_status: statuses,
      limit: 100,
    }),
  );
  save(
    "ads",
    await graphGetAllPages(`/${acc}/ads`, {
      fields: "id,name,adset_id,campaign_id,effective_status,created_time,creative{id,object_type,call_to_action_type,video_id}",
      effective_status: statuses,
      limit: 100,
    }),
  );

  const metrics = "spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,date_start,date_stop";
  console.log("Insights");
  save(
    "insights-campaign-monthly",
    await graphGetAllPages(`/${acc}/insights`, {
      level: "campaign",
      fields: `campaign_id,campaign_name,objective,${metrics}`,
      time_range: range,
      time_increment: "monthly",
      limit: 500,
    }),
  );
  save(
    "insights-adset",
    await graphGetAllPages(`/${acc}/insights`, { level: "adset", fields: `campaign_id,adset_id,adset_name,${metrics}`, time_range: range, limit: 500 }),
  );
  save(
    "insights-ad",
    await graphGetAllPages(`/${acc}/insights`, { level: "ad", fields: `campaign_id,adset_id,ad_id,ad_name,${metrics}`, time_range: range, limit: 500 }),
  );

  console.log("Quebras da conta");
  for (const [name, breakdowns] of [
    ["age-gender", "age,gender"],
    ["placement", "publisher_platform,platform_position"],
    ["region", "region"],
    ["device", "device_platform"],
  ] as const) {
    save(
      `breakdown-${name}`,
      await graphGetAllPages(`/${acc}/insights`, { level: "account", fields: metrics, breakdowns, time_range: range, limit: 500 }),
    );
  }
  console.log("Pronto.");
}

main().catch((err) => {
  // Nunca imprime o token: só a mensagem de erro da API.
  console.error("Falha:", err?.payload?.error?.message ?? err?.message ?? err);
  process.exit(1);
});
