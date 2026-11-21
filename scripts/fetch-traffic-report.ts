/**
 * Dados para o relatório de tráfego pago (só leitura): últimos 30 dias x 30 dias anteriores, em conta,
 * campanha, conjunto e anúncio, mais pixel/rastreamento e histórico de alterações da conta.
 * Saída: data/account-analysis/report/*.json (fora do git). Uso: node_modules/.bin/tsx scripts/fetch-traffic-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { AD_ACCOUNT_ID } from "../src/lib/config";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const errMsg = (e: unknown): string => (e as { payload?: { error?: { message?: string } } })?.payload?.error?.message ?? (e as Error)?.message ?? String(e);
const OUT = path.join(process.cwd(), "data", "account-analysis", "report");
fs.mkdirSync(OUT, { recursive: true });

const END = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const P1 = { since: addDays(END, -29), until: END }; // últimos 30 dias
const P0 = { since: addDays(END, -59), until: addDays(END, -30) }; // 30 dias anteriores

async function main() {
  const { graphGetAllPages, graphGet } = await import("../src/lib/meta/client");
  const save = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data));
    console.log(`  ${name}: ${Array.isArray(data) ? data.length : "ok"}`);
  };
  const safe = async <T>(name: string, fn: () => Promise<T>) => {
    try {
      save(name, await fn());
    } catch (err: unknown) {
      console.log(`  ${name}: FALHOU (${errMsg(err)})`);
      save(name, { error: errMsg(err) });
    }
  };
  save("periods", { P1, P0 });
  const metrics = "spend,impressions,reach,frequency,clicks,inline_link_clicks,inline_link_click_ctr,ctr,cpc,cpm,actions,action_values,cost_per_action_type,purchase_roas";

  for (const [tag, range] of [["p1", P1], ["p0", P0]] as const) {
    console.log(`Período ${tag} ${range.since} a ${range.until}`);
    await safe(`account-${tag}`, () => graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, { level: "account", fields: metrics, time_range: JSON.stringify(range) }));
    await safe(`campaign-${tag}`, () => graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, { level: "campaign", fields: `campaign_id,campaign_name,objective,${metrics}`, time_range: JSON.stringify(range), limit: 300 }));
    await safe(`adset-${tag}`, () => graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, { level: "adset", fields: `campaign_id,adset_id,adset_name,${metrics}`, time_range: JSON.stringify(range), limit: 300 }));
    await safe(`ad-${tag}`, () => graphGetAllPages(`/${AD_ACCOUNT_ID}/insights`, { level: "ad", fields: `campaign_id,adset_id,ad_id,ad_name,${metrics}`, time_range: JSON.stringify(range), limit: 300 }));
  }

  console.log("Entidades atuais");
  const statuses = '["ACTIVE","PAUSED","ARCHIVED","IN_PROCESS","WITH_ISSUES","CAMPAIGN_PAUSED","ADSET_PAUSED","PENDING_REVIEW","DISAPPROVED"]';
  await safe("campaigns", () => graphGetAllPages(`/${AD_ACCOUNT_ID}/campaigns`, { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,buying_type,created_time,updated_time,start_time,stop_time", effective_status: statuses, limit: 200 }));
  await safe("adsets", () =>
    graphGetAllPages(`/${AD_ACCOUNT_ID}/adsets`, {
      fields:
        "id,name,campaign_id,effective_status,daily_budget,optimization_goal,billing_event,bid_strategy,bid_amount,destination_type,attribution_spec,promoted_object,created_time," +
        "targeting{age_min,age_max,genders,geo_locations{countries},custom_audiences,excluded_custom_audiences,flexible_spec,targeting_automation,publisher_platforms}",
      effective_status: statuses,
      limit: 100,
    }),
  );

  console.log("Pixel e rastreamento");
  await safe("pixels", () => graphGetAllPages(`/${AD_ACCOUNT_ID}/adspixels`, { fields: "id,name,last_fired_time,is_unavailable,enable_automatic_matching,automatic_matching_fields,first_party_cookie_status,data_use_setting,creation_time", limit: 50 }));
  const pixels = JSON.parse(fs.readFileSync(path.join(OUT, "pixels.json"), "utf8"));
  if (Array.isArray(pixels)) {
    const stats: Record<string, unknown> = {};
    for (const p of pixels) {
      try {
        stats[p.id] = await graphGet(`/${p.id}/stats`, { aggregation: "event", start_time: `${P1.since}T00:00:00-0300`, end_time: `${END}T23:59:59-0300` });
      } catch (err: unknown) {
        stats[p.id] = { error: errMsg(err) };
      }
      try {
        stats[`${p.id}:source`] = await graphGet(`/${p.id}/stats`, { aggregation: "event_source", start_time: `${P1.since}T00:00:00-0300`, end_time: `${END}T23:59:59-0300` });
      } catch (err: unknown) {
        stats[`${p.id}:source`] = { error: errMsg(err) };
      }
    }
    save("pixel-stats", stats);
  }

  console.log("Histórico de alterações (60 dias)");
  await safe("activities", () => graphGetAllPages(`/${AD_ACCOUNT_ID}/activities`, { fields: "event_time,event_type,translated_event_type,object_name,object_type,extra_data,actor_name", since: P0.since, limit: 500 }));

  console.log("Pronto.");
}
main().catch((err) => {
  console.error("Falha:", errMsg(err) ?? err);
  process.exit(1);
});
