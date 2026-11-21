/**
 * Análise da conta de anúncios com "Compras na Meta" como base de cálculo.
 *
 * Compras na Meta = ação `onsite_conversion.purchase` da Graph API (a mesma regra do dashboard:
 * CONVERSION_CATEGORIES.purchase). Conferido com a coluna "Compras na Meta" das planilhas do Meta
 * (campanha a campanha, os números batem). O valor de compra que a Meta reporta NÃO é usado: a partir de
 * março ele vem multiplicado por 100 (ticket de ~R$ 44 mil), então a base é a contagem de compras e o CPA.
 *
 * Pré-requisito: scripts/fetch-account-full.ts e scripts/fetch-account-daily.ts (baixam os dados, só leitura).
 * Uso: node_modules/.bin/tsx scripts/build-account-analysis.ts
 * Saída: data/account-analysis/analysis.json
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "account-analysis");
const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;
const PURCHASE = "onsite_conversion.purchase";

interface Action {
  action_type: string;
  value: string;
}
interface Insight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  ad_name?: string;
  spend: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  date_start?: string;
  [k: string]: unknown;
}
interface Campaign {
  id: string;
  name: string;
  objective?: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
}
interface Adset {
  id: string;
  optimization_goal?: string;
  destination_type?: string;
  promoted_object?: { whatsapp_phone_number?: string; custom_event_type?: string };
  targeting?: { age_min?: number; age_max?: number; genders?: number[]; targeting_automation?: { advantage_audience?: number } };
}
interface Ad {
  id: string;
  effective_status: string;
  created_time?: string;
  creative?: { object_type?: string };
}

const purchases = (r: { actions?: Action[] }) => Number(r.actions?.find((a) => a.action_type === PURCHASE)?.value ?? 0);
const spendOf = (r: { spend: string }) => Number(r.spend);

const campaigns = read<Campaign[]>("campaigns");
const adsets = read<Adset[]>("adsets");
const ads = read<Ad[]>("ads");
const daily = read<Insight[]>("insights-campaign-daily");
const insAdset = read<Insight[]>("insights-adset");
const insAd = read<Insight[]>("insights-ad");
const campMap = new Map(campaigns.map((c) => [c.id, c]));
const adsetMap = new Map(adsets.map((a) => [a.id, a]));
const adMap = new Map(ads.map((a) => [a.id, a]));

// ---- totais e queda de rastreio ----
const total = daily.reduce((s, r) => ({ spend: s.spend + spendOf(r), purchases: s.purchases + purchases(r) }), { spend: 0, purchases: 0 });
const avgCpa = total.spend / total.purchases;

const byDay = new Map<string, { spend: number; purchases: number }>();
for (const r of daily) {
  const x = byDay.get(r.date_start!) ?? { spend: 0, purchases: 0 };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  byDay.set(r.date_start!, x);
}
// Dias com gasto alto e praticamente nenhuma compra reportada = falha de rastreio (não é desempenho do anúncio).
// Só conta sequências de 3+ dias seguidos (um dia isolado sem compra pode ser só um dia fraco).
const suspect = [...byDay].filter(([, x]) => x.spend >= 5000 && x.purchases <= 1).map(([d]) => d).sort();
const outageDays: string[] = [];
for (let i = 0, run: string[] = []; i <= suspect.length; i++) {
  const d = suspect[i];
  if (d && (run.length === 0 || Date.parse(d) - Date.parse(run[run.length - 1]) === 864e5)) run.push(d);
  else {
    if (run.length >= 3) outageDays.push(...run);
    run = d ? [d] : [];
  }
}
// Uma entrada por sequência (ex.: março e agosto).
const outages = outageDays.reduce<{ from: string; to: string; days: number; spend: number; purchases: number }[]>((runs, d) => {
  const last = runs[runs.length - 1];
  const x = byDay.get(d)!;
  if (last && Date.parse(d) - Date.parse(last.to) === 864e5) {
    last.to = d;
    last.days++;
    last.spend += x.spend;
    last.purchases += x.purchases;
  } else runs.push({ from: d, to: d, days: 1, spend: x.spend, purchases: x.purchases });
  return runs;
}, []);
const outage = outages.length ? { runs: outages, days: outageDays.length, spend: outages.reduce((s, o) => s + o.spend, 0), purchases: outages.reduce((s, o) => s + o.purchases, 0) } : null;
const isOutage = (d: string) => outageDays.includes(d);
const clean = daily.filter((r) => !isOutage(r.date_start!));

// ---- evolução ----
const monthMap = new Map<string, { spend: number; purchases: number }>();
for (const r of daily) {
  const k = r.date_start!.slice(0, 7);
  const x = monthMap.get(k) ?? { spend: 0, purchases: 0 };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  monthMap.set(k, x);
}
const monthly = [...monthMap].sort().map(([month, x]) => ({ month, spend: x.spend, purchases: x.purchases, cpa: x.spend / x.purchases }));
const monthlyCpa = new Map(
  (() => {
    const m = new Map<string, { spend: number; purchases: number }>();
    for (const r of clean) {
      const k = r.date_start!.slice(0, 7);
      const x = m.get(k) ?? { spend: 0, purchases: 0 };
      x.spend += spendOf(r);
      x.purchases += purchases(r);
      m.set(k, x);
    }
    return [...m].map(([k, x]) => [k, x.spend / x.purchases] as const);
  })(),
);
const weekStart = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const weekMap = new Map<string, { spend: number; purchases: number }>();
for (const r of daily) {
  const k = weekStart(r.date_start!);
  const x = weekMap.get(k) ?? { spend: 0, purchases: 0 };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  weekMap.set(k, x);
}
const weekly = [...weekMap].sort().slice(-18).map(([week, x]) => ({ week, spend: x.spend, purchases: x.purchases, cpa: x.purchases ? x.spend / x.purchases : null }));

// ---- helpers de agrupamento ----
interface Row {
  label: string;
  spend: number;
  share: number;
  purchases: number;
  cpa: number | null;
  vsAvg: number | null; // % do CPA contra a média da conta
  index?: number; // compras reais ÷ compras esperadas pelo CPA do mês (>1 = melhor que a conta no mesmo mês)
  n?: number;
}
function group(rows: Insight[], keyFn: (r: Insight) => string | null, minSpend: number, limit = 20): Row[] {
  const m = new Map<string, { spend: number; purchases: number; n: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null) continue;
    const x = m.get(k) ?? { spend: 0, purchases: 0, n: 0 };
    x.spend += spendOf(r);
    x.purchases += purchases(r);
    x.n++;
    m.set(k, x);
  }
  return [...m]
    .filter(([, x]) => x.spend >= minSpend)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, limit)
    .map(([label, x]) => ({
      label,
      spend: x.spend,
      share: x.spend / total.spend,
      purchases: x.purchases,
      cpa: x.purchases ? x.spend / x.purchases : null,
      vsAvg: x.purchases ? (x.spend / x.purchases / avgCpa - 1) * 100 : null,
      n: x.n,
    }));
}
/** Índice controlado pelo mês, nas linhas diárias (sem os dias de falha de rastreio). */
function indexed(keyFn: (r: Insight) => string | null, minSpend: number, from = "2026-03-01", order?: string[]): Row[] {
  const m = new Map<string, { spend: number; purchases: number; expected: number; camps: Set<string> }>();
  // A participação é sobre o gasto do mesmo recorte (desde "from", sem os dias de falha de rastreio).
  const denom = clean.filter((r) => r.date_start! >= from).reduce((s, r) => s + spendOf(r), 0);
  for (const r of clean) {
    if (r.date_start! < from) continue;
    const k = keyFn(r);
    if (k === null) continue;
    const cpa = monthlyCpa.get(r.date_start!.slice(0, 7))!;
    const x = m.get(k) ?? { spend: 0, purchases: 0, expected: 0, camps: new Set() };
    x.spend += spendOf(r);
    x.purchases += purchases(r);
    x.expected += spendOf(r) / cpa;
    x.camps.add(r.campaign_id!);
    m.set(k, x);
  }
  const rows = [...m]
    .filter(([, x]) => x.spend >= minSpend)
    .map(([label, x]) => ({
      label,
      spend: x.spend,
      share: x.spend / denom,
      purchases: x.purchases,
      cpa: x.purchases ? x.spend / x.purchases : null,
      vsAvg: x.purchases ? (x.spend / x.purchases / avgCpa - 1) * 100 : null,
      index: x.purchases / x.expected,
      n: x.camps.size,
    }));
  return order ? rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : rows.sort((a, b) => b.spend - a.spend);
}

const campName = (r: Insight) => campMap.get(r.campaign_id!)?.name ?? "";
const structureOf = (n: string) => {
  const m = /(?:^|[\s[|(])(\d)-(\d{1,2})-(\d{1,2})(?:[\]\s|)]|$)/.exec(n);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "(sem padrão no nome)";
};
const isCbo = (c?: Campaign) => Boolean(c?.daily_budget || c?.lifetime_budget);

// ---- tipos de campanha / conjunto / anúncio ----
const adsetOf = (r: Insight) => adsetMap.get(r.adset_id!);
const firstSpend = new Map<string, string>();
for (const r of daily) {
  const f = firstSpend.get(r.campaign_id!);
  if (!f || r.date_start! < f) firstSpend.set(r.campaign_id!, r.date_start!);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

const types = {
  optimizationGoal: group(insAdset, (r) => adsetOf(r)?.optimization_goal ?? "(sem)", 1000),
  destination: group(insAdset, (r) => adsetOf(r)?.destination_type ?? "(sem)", 1000),
  budgetType: indexed((r) => (isCbo(campMap.get(r.campaign_id!)) ? "CBO (orçamento na campanha)" : "ABO (orçamento no conjunto)"), 5000),
  structure: indexed((r) => structureOf(campName(r)), 30000),
  audienceAge: group(insAdset, (r) => {
    const t = adsetOf(r)?.targeting;
    return t ? `${t.age_min ?? "?"}-${t.age_max ?? "?"} anos` : "(sem)";
  }, 20000),
  advantage: group(insAdset, (r) => (adsetOf(r)?.targeting?.targeting_automation?.advantage_audience === 1 ? "Advantage+ (aberto)" : "Público manual"), 20000),
  whatsapp: group(insAdset, (r) => adsetOf(r)?.promoted_object?.whatsapp_phone_number?.slice(-4) ?? "(sem número)", 5000),
  creativeType: group(insAd, (r) => {
    const t = adMap.get(r.ad_id!)?.creative?.object_type;
    return t === "VIDEO" ? "Vídeo" : t === "SHARE" ? "Imagem/outro (SHARE)" : (t ?? "(sem)");
  }, 5000),
};

const family = (n: string) => {
  const s = (n || "").trim();
  if (/^\d/.test(s)) return "Numerados (1, 2, 125, 197…)";
  const m = /^(IMG|IMAGEM|AD|NP|C|V|B)/i.exec(s);
  if (!m) return "Outros";
  const f = m[1].toUpperCase();
  return f === "IMAGEM" ? "IMG" : f === "AD" ? "AD (AD173, AD191…)" : f;
};
const creativeFamilies = group(insAd, (r) => family(r.ad_name ?? ""), 10000);
const createdMonthCohort = group(insAd, (r) => {
  const c = adMap.get(r.ad_id!)?.created_time;
  return c ? c.slice(0, 7) : null;
}, 20000).sort((a, b) => a.label.localeCompare(b.label));

const budgetBands = indexed(
  (r) => {
    const s = spendOf(r);
    return s < 700 ? "a) até R$ 700/dia" : s < 1500 ? "b) R$ 700 a 1.500" : s < 3000 ? "c) R$ 1.500 a 3.000" : s < 6000 ? "d) R$ 3.000 a 6.000" : "e) acima de R$ 6.000";
  },
  5000,
);
const ageBands = indexed(
  (r) => {
    const a = daysBetween(r.date_start!, firstSpend.get(r.campaign_id!)!);
    return a < 3 ? "a) dias 1 a 3" : a < 7 ? "b) dias 4 a 7" : a < 14 ? "c) dias 8 a 14" : a < 30 ? "d) dias 15 a 30" : a < 60 ? "e) dias 31 a 60" : "f) mais de 60 dias";
  },
  5000,
);
const weekdays = indexed((r) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(`${r.date_start}T12:00:00Z`).getUTCDay()], 5000, "2026-03-01", ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]);

// ---- quebras da conta ----
const ageGender = group(read<Insight[]>("breakdown-age-gender"), (r) => `${r.age} · ${r.gender === "female" ? "mulheres" : r.gender === "male" ? "homens" : r.gender}`, 20000);
const placements = group(read<Insight[]>("breakdown-placement"), (r) => `${r.publisher_platform} · ${String(r.platform_position).replace(/_/g, " ")}`, 30000);
const regions = group(read<Insight[]>("breakdown-region"), (r) => String(r.region).replace(" (state)", ""), 40000, 14);
const regionAll = read<Insight[]>("breakdown-region");

// ---- criativos ----
const normalizeAd = (n: string) => {
  const s = (n || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\s*[—–-]\s*c[óo]pia$/, "")
    .replace(/^imagem\s*/, "img")
    .replace(/^ads?\s*(?=\d)/, "")
    .replace(/(?<=\d)\s*ads$/, "")
    .replace(/^([a-z]*)0+(?=\d)/, "$1");
  return s === "5" ? "125" : s;
};
const creatives = new Map<string, { spend: number; purchases: number; ads: number; active: number; type: Set<string> }>();
for (const r of insAd) {
  const k = normalizeAd(r.ad_name ?? "");
  const x = creatives.get(k) ?? { spend: 0, purchases: 0, ads: 0, active: 0, type: new Set() };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  x.ads++;
  const a = adMap.get(r.ad_id!);
  if (a?.effective_status === "ACTIVE") x.active++;
  if (a?.creative?.object_type) x.type.add(a.creative.object_type === "VIDEO" ? "vídeo" : "imagem");
  creatives.set(k, x);
}
const creativeRows = [...creatives]
  .filter(([, x]) => x.spend >= 30000 && x.purchases >= 50)
  .map(([k, x]) => ({
    name: /^[a-z]*\d/.test(k) ? k.toUpperCase() : k,
    spend: x.spend,
    purchases: x.purchases,
    cpa: x.spend / x.purchases,
    vsAvg: (x.spend / x.purchases / avgCpa - 1) * 100,
    ads: x.ads,
    active: x.active,
    type: [...x.type].join("/"),
  }))
  .sort((a, b) => a.cpa - b.cpa);

// ---- campanhas ----
const campAgg = new Map<string, { spend: number; purchases: number; days: number; first: string; last: string }>();
for (const r of daily) {
  if (r.date_start! < "2026-03-01" || isOutage(r.date_start!)) continue;
  const x = campAgg.get(r.campaign_id!) ?? { spend: 0, purchases: 0, days: 0, first: r.date_start!, last: r.date_start! };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  x.days++;
  if (r.date_start! < x.first) x.first = r.date_start!;
  if (r.date_start! > x.last) x.last = r.date_start!;
  campAgg.set(r.campaign_id!, x);
}
const campRows = [...campAgg]
  .filter(([, x]) => x.purchases >= 150 && x.spend >= 20000)
  .map(([id, x]) => ({
    name: campMap.get(id)?.name ?? id,
    status: campMap.get(id)?.effective_status ?? "",
    spend: x.spend,
    purchases: x.purchases,
    cpa: x.spend / x.purchases,
    vsAvg: (x.spend / x.purchases / avgCpa - 1) * 100,
    days: x.days,
  }))
  .sort((a, b) => a.cpa - b.cpa);

// hoje: 1 a 10 do mês corrente
const lastDay = [...byDay.keys()].sort().at(-1)!;
const recentFrom = `${lastDay.slice(0, 8)}01`;
const recent = new Map<string, { spend: number; purchases: number }>();
for (const r of daily) {
  if (r.date_start! < recentFrom) continue;
  const x = recent.get(r.campaign_id!) ?? { spend: 0, purchases: 0 };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  recent.set(r.campaign_id!, x);
}
const recentTotal = [...recent.values()].reduce((s, x) => ({ spend: s.spend + x.spend, purchases: s.purchases + x.purchases }), { spend: 0, purchases: 0 });
const now = {
  from: recentFrom,
  to: lastDay,
  spend: recentTotal.spend,
  purchases: recentTotal.purchases,
  cpa: recentTotal.purchases ? recentTotal.spend / recentTotal.purchases : null,
  campaigns: [...recent]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10)
    .map(([id, x]) => {
      const c = campMap.get(id);
      return { name: c?.name ?? id, status: c?.effective_status ?? "", budget: c?.daily_budget ? Number(c.daily_budget) / 100 : null, spend: x.spend, purchases: x.purchases, cpa: x.purchases ? x.spend / x.purchases : null };
    }),
};

// ---- desperdício e vida útil ----
const perCamp = new Map<string, { spend: number; purchases: number; days: number }>();
for (const r of clean) {
  const x = perCamp.get(r.campaign_id!) ?? { spend: 0, purchases: 0, days: 0 };
  x.spend += spendOf(r);
  x.purchases += purchases(r);
  x.days++;
  perCamp.set(r.campaign_id!, x);
}
const zero = [...perCamp.values()].filter((x) => x.purchases === 0 && x.spend >= 300);
const poor = [...perCamp.values()].filter((x) => x.spend >= 5000 && x.purchases > 0 && x.spend / x.purchases > avgCpa * 1.3);
const big = [...perCamp.values()].filter((x) => x.spend >= 30000).map((x) => x.days).sort((a, b) => a - b);
const sortedSpend = [...perCamp.values()].map((x) => x.spend).sort((a, b) => b - a);
const waste = {
  zeroCampaigns: zero.length,
  zeroSpend: zero.reduce((s, x) => s + x.spend, 0),
  poorCampaigns: poor.length,
  poorSpend: poor.reduce((s, x) => s + x.spend, 0),
  campaignsTotal: perCamp.size,
  top10Share: sortedSpend.slice(0, 10).reduce((s, x) => s + x, 0) / sortedSpend.reduce((s, x) => s + x, 0),
  lifespan: { campaigns: big.length, median: big[Math.floor(big.length / 2)], p25: big[Math.floor(big.length * 0.25)], p75: big[Math.floor(big.length * 0.75)] },
};

const out = {
  generatedAt: new Date().toISOString(),
  window: { start: [...byDay.keys()].sort()[0], end: lastDay },
  definition: "Compras na Meta = ação onsite_conversion.purchase (a mesma da coluna “Compras na Meta” das planilhas do Meta).",
  account: { spend: total.spend, purchases: total.purchases, cpa: avgCpa, campaigns: campaigns.length, adsets: adsets.length, ads: ads.length },
  outage,
  monthly,
  weekly,
  types: { ...types, creativeFamilies, createdMonthCohort },
  curves: { budgetBands, ageBands, weekdays },
  breakdowns: { ageGender, placements, regions, regionAll: regionAll.length },
  creatives: creativeRows,
  campaignsBest: campRows.slice(0, 10),
  campaignsWorst: campRows.slice(-8),
  now,
  waste,
};
fs.writeFileSync(path.join(DIR, "analysis.json"), JSON.stringify(out, null, 2));
console.log(`OK: conta ${out.account.purchases} compras na Meta, CPA R$ ${avgCpa.toFixed(0)} | queda de rastreio: ${outage ? outage.runs.map((o) => `${o.from} a ${o.to}`).join(" e ") + ` (R$ ${outage.spend.toFixed(0)}, ${outage.purchases} compras)` : "nenhuma"}`);
