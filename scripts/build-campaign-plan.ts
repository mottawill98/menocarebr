/**
 * Plano de campanhas baseado no LUCRO DA TABELA (a mesma da aba "Métricas"):
 *   lucro = receita dos pagantes − gasto (planilhas do Meta) − R$ 80 × (vendas + inadimplentes) − valor em aberto dos inadimplentes.
 * Tudo vem de data/leads-roi/aggregated.json (CRM + planilhas). O Gerenciador/API entra só para o gasto diário por anúncio
 * (insights-ad-daily.json, usado para medir a capacidade de gasto de cada criativo e o que está ligado hoje). Compras na Meta
 * e CPA do Gerenciador NÃO entram em nenhuma decisão.
 *
 * Uso: node_modules/.bin/tsx scripts/build-campaign-plan.ts [orçamento_diário=20000] [--tests]
 *   Sem --tests (padrão) o orçamento inteiro vai para criativos com histórico; com --tests uma parte vira reserva de testes.
 * Saída: data/leads-roi/plan.json
 */
import fs from "node:fs";
import path from "node:path";
import type { LeadsRoiData } from "../src/lib/leads-roi";

const BUDGET = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 20000);
const WITH_TESTS = process.argv.includes("--tests");
const UNIT_COST = 80;
const root = process.cwd();
const read = <T>(...p: string[]) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8")) as T;
const data = read<LeadsRoiData>("data", "leads-roi", "aggregated.json");
const START = data.sources.leadsRange[0];
const END = data.sources.leadsRange[1];
const MATURE_END = (() => {
  const d = new Date(`${END}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 14); // vendas dos leads mais recentes ainda não amadureceram
  return d.toISOString().slice(0, 10);
})();

// Gasto diário por anúncio (Gerenciador): só gasto, para capacidade e "ligado hoje".
interface AdDay {
  ad_name: string;
  date: string;
  spend: number;
}
const adDaily = fs.existsSync(path.join(root, "data", "account-analysis", "insights-ad-daily.json")) ? read<AdDay[]>("data", "account-analysis", "insights-ad-daily.json") : [];
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
const dailySpend = new Map<string, Map<string, number>>();
for (const r of adDaily) {
  const k = normalizeAd(r.ad_name);
  const m = dailySpend.get(k) ?? new Map<string, number>();
  m.set(r.date, (m.get(r.date) ?? 0) + r.spend);
  dailySpend.set(k, m);
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

// ---- calendário e acumuladores da tabela ----
const days: string[] = [];
for (let d = START; d <= END; d = addDays(d, 1)) days.push(d);
const dayIndex = new Map(days.map((d, i) => [d, i]));
const sum = (a: number[], from = 0, to = a.length) => a.slice(from, to).reduce((p, q) => p + q, 0);
interface Acc {
  leads: number;
  sales: number;
  rev: number;
  inad: number;
  inadV: number;
  L: number[];
  S: number[];
}
const acc: Acc[] = data.ads.map(() => ({ leads: 0, sales: 0, rev: 0, inad: 0, inadV: 0, L: days.map(() => 0), S: days.map(() => 0) }));
for (const [a, , day, l, s, r, i, iv] of data.rows) {
  if (day === "" || day < START) continue;
  const x = acc[a];
  x.leads += l;
  x.sales += s;
  x.rev += r;
  x.inad += i;
  x.inadV += iv;
  const k = dayIndex.get(day);
  if (k !== undefined) {
    x.L[k] += l;
    x.S[k] += s;
  }
}

// ---- criativos (lucro da tabela) ----
interface Creative {
  name: string;
  key: string;
  spend: number;
  leads: number;
  orders: number;
  inadRate: number;
  conv: number;
  cpl: number;
  profit: number;
  roi: number;
  contribLead: number; // lucro por lead antes do anúncio
  cplCeil: number; // CPL máximo para manter ROI ≥ 100%
  peakDaily: number; // maior média de 7 dias do gasto diário
  spend7: number; // gasto por dia nos últimos 7 dias
  active: boolean;
  convEarly: number | null;
  convLate: number | null;
  first: string;
  last: string;
}
const pretty = (k: string, fallback: string) => (/^[a-z]*\d/.test(k) ? k.toUpperCase() : fallback);
const creatives: Creative[] = [];
data.ads.forEach((ad, i) => {
  const x = acc[i];
  const spend = ad.spend?.spend ?? 0;
  if (ad.key === "" || spend < 5000 || x.leads === 0) return;
  const orders = x.sales + x.inad;
  const cpl = spend / x.leads;
  const contrib = (x.rev - UNIT_COST * orders - x.inadV) / x.leads;
  const profit = x.rev - spend - UNIT_COST * orders - x.inadV;
  // capacidade: maior média de 7 dias de gasto real (Gerenciador); sem isso, leads/dia × CPL
  const ds = dailySpend.get(ad.key);
  let peak = 0;
  if (ds) {
    for (const d0 of ds.keys()) {
      let s7 = 0;
      for (let j = 0; j < 7; j++) s7 += ds.get(addDays(d0, j)) ?? 0;
      peak = Math.max(peak, s7 / 7);
    }
  } else {
    for (let k = 0; k + 6 < days.length; k++) peak = Math.max(peak, (sum(x.L, k, k + 7) / 7) * cpl);
  }
  const spend7 = ds ? days.slice(-7).reduce((s, d) => s + (ds.get(d) ?? 0), 0) / 7 : (sum(x.L, days.length - 7) / 7) * cpl;
  const mature = days.indexOf(MATURE_END) + 1;
  const idx = x.L.slice(0, mature).map((v, k) => (v > 0 ? k : -1)).filter((k) => k >= 0);
  const mid = idx[Math.floor(idx.length / 2)] ?? 0;
  const e = { l: sum(x.L, 0, mid), s: sum(x.S, 0, mid) };
  const l2 = { l: sum(x.L, mid, mature), s: sum(x.S, mid, mature) };
  const firstIdx = x.L.findIndex((v) => v > 0);
  const lastIdx = x.L.length - 1 - [...x.L].reverse().findIndex((v) => v > 0);
  creatives.push({
    name: pretty(ad.key, ad.name),
    key: ad.key,
    spend,
    leads: x.leads,
    orders,
    inadRate: orders > 0 ? (x.inad / orders) * 100 : 0,
    conv: (x.sales / x.leads) * 100,
    cpl,
    profit,
    roi: (profit / spend) * 100,
    contribLead: contrib,
    cplCeil: contrib / 2,
    peakDaily: peak,
    spend7,
    active: spend7 >= 200,
    convEarly: e.l > 0 ? (e.s / e.l) * 100 : null,
    convLate: l2.l > 0 ? (l2.s / l2.l) * 100 : null,
    first: days[firstIdx],
    last: days[lastIdx],
  });
});
creatives.sort((a, b) => b.profit - a.profit);

// ---- alocação do orçamento ----
// Capacidade provada = maior gasto diário médio de uma semana do criativo. Fração: faixa (A = 300+ pedidos, B = 80–299) ×
// ROI (≥150% pleno, 100–150% metade) × qualidade (inadimplência > 10% ou conversão caindo mais de 25% = 0,8).
// Cada criativo limitado a 14% do total. Nenhuma campanha passa de MAX_CAMPAIGN por dia (acima disso o CPA do Gerenciador sobe).
const MAX_SHARE = 0.14;
const MAX_CAMPAIGN = 3000;
const round50 = (v: number) => Math.round(v / 50) * 50;
interface Pick extends Creative {
  tier: "A" | "B";
  fraction: number;
  budget: number;
  why: string[];
}
const eligible = creatives.filter((c) => c.spend >= 9000 && c.roi >= 100 && c.inadRate <= 15 && c.orders >= 80);
const picks: Pick[] = eligible
  .map((c) => {
    const tier: "A" | "B" = c.orders >= 300 ? "A" : "B";
    const declining = c.convEarly !== null && c.convLate !== null && c.convEarly > 0 && c.convLate < 0.75 * c.convEarly;
    const risky = c.inadRate > 10 || declining;
    const fraction = (tier === "A" ? 1 : 0.8) * (c.roi >= 150 ? 1 : 0.5) * (risky ? 0.8 : 1);
    const comma = (v: number) => v.toFixed(1).replace(".", ",");
    const why = [
      `lucro de ${Math.round(c.profit).toLocaleString("pt-BR")} reais e ROI de ${c.roi.toFixed(0)}% na tabela (já com custo operacional e inadimplência)`,
      `${c.orders.toLocaleString("pt-BR")} pedidos${tier === "B" ? " (amostra menor: orçamento reduzido)" : ""}`,
      `inadimplência de ${c.inadRate.toFixed(0)}%${c.inadRate > 10 ? " (acima de 10%: orçamento reduzido)" : ""}`,
    ];
    if (c.roi < 150) why.push("ROI abaixo de 150%: metade da capacidade");
    if (declining) why.push(`conversão caiu de ${comma(c.convEarly!)}% para ${comma(c.convLate!)}%: orçamento reduzido`);
    return { ...c, tier, fraction, budget: Math.min(round50(c.peakDaily * fraction), round50(BUDGET * MAX_SHARE)), why };
  })
  .sort((a, b) => b.roi - a.roi);
// Criativos bons, mas com pouco gasto ou pedidos (amostra pequena).
const smallItems = creatives
  .filter((c) => !picks.some((p) => p.name === c.name) && c.roi >= 100 && c.inadRate <= 15)
  .map((c) => ({ ...c, budget: Math.min(round50(c.peakDaily * 0.5), 400) }));
let testItems: typeof smallItems = [];
if (WITH_TESTS) testItems = smallItems;
else {
  // Sem reserva de testes: os de amostra pequena entram como criativos normais, com metade da capacidade...
  for (const c of smallItems) {
    picks.push({
      ...c,
      tier: "B",
      fraction: 0.5,
      budget: c.budget,
      why: [
        `lucro de ${Math.round(c.profit).toLocaleString("pt-BR")} reais e ROI de ${c.roi.toFixed(0)}% na tabela (já com custo operacional e inadimplência)`,
        `inadimplência de ${c.inadRate.toFixed(0)}%`,
        `amostra pequena (${c.orders.toLocaleString("pt-BR")} pedidos e R$ ${Math.round(c.spend).toLocaleString("pt-BR")} de gasto): orçamento reduzido, sobe só se o resultado se confirmar`,
      ],
    });
  }
  picks.sort((a, b) => b.roi - a.roi);
  // ...e o que sobrar vai, de 50 em 50, para quem tem maior ROI, sem passar da capacidade já provada de cada criativo.
  const cap = (p: Pick) => Math.min(round50(p.peakDaily), round50(BUDGET * MAX_SHARE));
  let left = BUDGET - picks.reduce((s, p) => s + p.budget, 0);
  for (let guard = 0; left >= 50 && guard < 500; guard++) {
    const p = picks.find((x) => x.orders >= 80 && x.budget + 50 <= cap(x) && x.budget < cap(x));
    if (!p) break;
    // distribui em rodadas: um passo de 50 para cada criativo elegível, do maior ROI ao menor
    for (const q of picks) {
      if (left < 50) break;
      if (q.orders >= 80 && q.budget + 50 <= cap(q)) {
        q.budget += 50;
        left -= 50;
      }
    }
  }
}
for (const p of picks) {
  const f = p.peakDaily > 0 ? p.budget / p.peakDaily : 0;
  p.why.push(`o plano usa ${Math.round(f * 100)}% da capacidade já provada (R$ ${Math.round(p.peakDaily).toLocaleString("pt-BR")} por dia numa semana boa)`);
}
const allocated = picks.reduce((s, p) => s + p.budget, 0);
const reserve = BUDGET - allocated;
const newVariants = WITH_TESTS ? Math.max(0, reserve - testItems.reduce((s, t) => s + t.budget, 0)) : 0;

// ---- campanhas: um conjunto por criativo, até MAX_CAMPAIGN por dia ----
const isImg = (n: string) => /^IMG/i.test(n);
const groupOf = (p: Pick) => (p.tier === "A" && p.roi >= 150 && p.inadRate <= 10 ? "Campeões" : p.roi >= 150 ? (isImg(p.name) ? "Escala IMG" : "Escala recentes") : "Estáveis");
const GOALS: Record<string, string> = {
  Campeões: "Os criativos com mais volume e pedidos, ROI líquido ≥ 150% e inadimplência até 10%. É onde fica o grosso do orçamento.",
  "Escala IMG": "Imagens com ROI ≥ 150% e menos histórico ou sinais de desgaste. Orçamento menor que a capacidade já provada.",
  "Escala recentes": "Criativos mais novos com ROI ≥ 150%. A conversão cai depois das primeiras semanas, então ficam abaixo da capacidade.",
  Estáveis: "ROI líquido entre 100% e 150%. Dão volume, mas com margem menor: metade da capacidade. Têm pouca folga de CPL até o teto, então são os primeiros a reduzir se o CPL subir.",
};
interface Part {
  name: string;
  budget: number;
  group: string;
  roi: number;
}
const parts: Part[] = [];
for (const p of picks) {
  const n = Math.ceil(p.budget / MAX_CAMPAIGN);
  for (let i = 0; i < n; i++) parts.push({ name: p.name, budget: round50(p.budget / n), group: groupOf(p), roi: p.roi });
}
parts.sort((a, b) => Object.keys(GOALS).indexOf(a.group) - Object.keys(GOALS).indexOf(b.group) || b.roi - a.roi || b.budget - a.budget);
interface Bin {
  group: string;
  items: Part[];
  budget: number;
}
const bins: Bin[] = [];
for (const part of parts) {
  const bin = bins.find((b) => b.group === part.group && b.items.length < 4 && b.budget + part.budget <= MAX_CAMPAIGN && !b.items.some((i) => i.name === part.name));
  if (bin) {
    bin.items.push(part);
    bin.budget += part.budget;
  } else bins.push({ group: part.group, items: [part], budget: part.budget });
}
const WA = ["1613", "4115", "3716", "2750", "4936"];
const plan = bins.map((b, i) => ({
  name: `Campanha ${i + 1} · ${b.group}`,
  group: b.group,
  goal: GOALS[b.group],
  structure: `1-${b.items.length}-1`,
  whatsapp: WA[i % WA.length],
  budget: b.budget,
  items: b.items.map((x) => ({ name: x.name, budget: x.budget })),
}));
const testBudget = WITH_TESTS ? testItems.reduce((s, t) => s + t.budget, 0) + newVariants : 0;
const nTests = testBudget > 0 ? Math.ceil(testBudget / MAX_CAMPAIGN) : 0;
const tests = Array.from({ length: nTests }, (_, i) => ({ name: `Campanha ${plan.length + i + 1} · Testes`, whatsapp: WA[(plan.length + i) % WA.length], budget: round50(testBudget / nTests) }));

// ---- cenários: se o CPL subir ao escalar ----
const scenarios = [1, 1.3, 1.6].map((f) => ({ cplFactor: f, profitPerDay: picks.reduce((s, p) => s + p.budget * (p.contribLead / (p.cpl * f) - 1), 0) }));
const expected = (() => {
  let l = 0;
  let o = 0;
  for (const p of picks) {
    l += p.budget / p.cpl;
    o += (p.budget / p.cpl) * (p.orders / p.leads);
  }
  return { leads: l, orders: o };
})();

// ---- o que está ligado hoje ----
const now = creatives
  .filter((c) => c.active)
  .map((c) => ({ name: c.name, spendPerDay: c.spend7, roi: c.roi, inadRate: c.inadRate, cpl: c.cpl, cplCeil: c.cplCeil, profit: c.profit, inPlan: picks.some((p) => p.name === c.name) }))
  .sort((a, b) => b.spendPerDay - a.spendPerDay);
const nowAll = new Map<string, number>();
for (const r of adDaily) if (dayDiff(END, r.date) < 7) nowAll.set(r.date, (nowAll.get(r.date) ?? 0) + r.spend);
const nowSpendPerDay = nowAll.size ? [...nowAll.values()].reduce((s, v) => s + v, 0) / 7 : now.reduce((s, n) => s + n.spendPerDay, 0);
const nowProfitPerDay = creatives.filter((c) => c.active).reduce((s, c) => s + (c.spend7 / c.cpl) * (c.contribLead - c.cpl), 0);

// ---- campanhas existentes: custo real da planilha "Custo campanhas" ----
const struct = (n: string) => /(?:^|[\s[|(])(\d)-(\d{1,2})-(\d{1,2})(?:[\]\s|)]|$)/.exec(n)?.slice(1, 4).join("-") ?? null;
const camps = data.campaigns.map((c) => ({ ...c, st: struct(c.name) }));
const MAX_PLAUSIBLE_CPL = 40;
const campAgg = new Map<number, { leads: number; sales: number; rev: number; inad: number; inadV: number; ads: Map<number, number> }>();
for (const [a, c, day, l, s, r, i, iv] of data.rows) {
  if (day === "" || day < START) continue;
  const x = campAgg.get(c) ?? { leads: 0, sales: 0, rev: 0, inad: 0, inadV: 0, ads: new Map() };
  x.leads += l;
  x.sales += s;
  x.rev += r;
  x.inad += i;
  x.inadV += iv;
  x.ads.set(a, (x.ads.get(a) ?? 0) + l);
  campAgg.set(c, x);
}
const campaignRows = [...campAgg]
  .map(([c, x]) => {
    const spend = data.campaigns[c].spend?.spend ?? 0;
    return {
      name: data.campaigns[c].name,
      leads: x.leads,
      spend,
      profit: x.rev - spend - UNIT_COST * (x.sales + x.inad) - x.inadV,
      inadRate: x.sales + x.inad > 0 ? (x.inad / (x.sales + x.inad)) * 100 : 0,
      ads: [...x.ads].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([a]) => data.ads[a].name),
    };
  })
  // CPL acima de R$ 40 = custo que não bate com os leads (nome diferente entre CRM e Meta): fora dos rankings.
  .filter((c) => c.spend > 15000 && c.leads > 0 && c.spend / c.leads <= MAX_PLAUSIBLE_CPL && c.name !== "(sem campanha identificada)");
const bestCampaigns = [...campaignRows].sort((a, b) => b.profit / b.spend - a.profit / a.spend).slice(0, 5);
const worstCampaigns = [...campaignRows].sort((a, b) => a.profit / a.spend - b.profit / b.spend).slice(0, 5);

// estrutura com custo real
const structReal = new Map<string, { n: number; leads: number; spend: number; sales: number; inad: number; profit: number }>();
for (const [c, x] of campAgg) {
  const st = camps[c].st;
  const spend = data.campaigns[c].spend?.spend ?? 0;
  if (!st || !spend || x.leads < 300 || spend / x.leads > MAX_PLAUSIBLE_CPL) continue;
  const g = structReal.get(st) ?? { n: 0, leads: 0, spend: 0, sales: 0, inad: 0, profit: 0 };
  g.n++;
  g.leads += x.leads;
  g.spend += spend;
  g.sales += x.sales;
  g.inad += x.inad;
  g.profit += x.rev - spend - UNIT_COST * (x.sales + x.inad) - x.inadV;
  structReal.set(st, g);
}
const structures = [...structReal]
  .filter(([, g]) => g.leads >= 5000)
  .sort((a, b) => b[1].leads - a[1].leads)
  .map(([structure, g]) => ({ structure, campaigns: g.n, leads: g.leads, spend: g.spend, cpl: g.spend / g.leads, conv: (g.sales / g.leads) * 100, inadRate: (g.inad / (g.sales + g.inad)) * 100, roi: (g.profit / g.spend) * 100 }));

// o que NÃO repetir: criativos com lucro baixo, negativo ou inadimplência alta
const avoid = creatives
  .filter((c) => !picks.some((p) => p.name === c.name) && c.spend >= 20000 && (c.roi < 60 || c.inadRate > 15))
  .sort((a, b) => b.spend - a.spend)
  .slice(0, 16);

const out = {
  generatedAt: new Date().toISOString(),
  basis: "Lucro da tabela: receita dos pagantes − gasto das planilhas − R$ 80 × pedidos enviados − valor em aberto dos inadimplentes",
  budget: BUDGET,
  window: { start: START, end: END, matureEnd: MATURE_END },
  unitCost: UNIT_COST,
  maxCampaign: MAX_CAMPAIGN,
  creatives: creatives.slice(0, 16),
  picks,
  plan,
  tests,
  test: { items: testItems, newVariants },
  allocated,
  reserve,
  scenarios,
  expected,
  now,
  nowSpendPerDay,
  nowProfitPerDay,
  structures,
  bestCampaigns,
  worstCampaigns,
  avoid,
};
fs.writeFileSync(path.join(root, "data", "leads-roi", "plan.json"), JSON.stringify(out, null, 2));
console.log(`Base: lucro da tabela | alocado R$ ${allocated} em ${picks.length} criativos + reserva R$ ${reserve}`);
for (const c of plan) console.log(`${c.name} (${c.structure}) R$ ${c.budget}: ${c.items.map((i) => `${i.name} ${i.budget}`).join(", ")}`);
for (const t of tests) console.log(`${t.name} R$ ${t.budget}`);
console.log("teste:", testItems.map((t) => `${t.name} ${t.budget}`).join(", "), `+ novas variações R$ ${newVariants}`);
console.log("cenários (lucro/dia):", scenarios.map((s) => `CPL×${s.cplFactor}: R$ ${s.profitPerDay.toFixed(0)}`).join(" | "));
console.log(`hoje: gasto R$ ${nowSpendPerDay.toFixed(0)}/dia, lucro estimado R$ ${nowProfitPerDay.toFixed(0)}/dia | ligados: ${now.map((n) => `${n.name} ${n.spendPerDay.toFixed(0)} (ROI ${n.roi.toFixed(0)}%)`).join(", ")}`);
