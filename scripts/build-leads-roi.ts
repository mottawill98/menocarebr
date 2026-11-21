/**
 * Cruza as planilhas de leads (CRM) com a de leads que pagaram e gera um
 * agregado por anúncio × dia em data/leads-roi/aggregated.json.
 *
 * Uso:
 *   node_modules/.bin/tsx scripts/build-leads-roi.ts [TODOS_OS_LEADS.csv] [LEADS_QUE_PAGARAM.csv]
 *
 * O JSON gerado NÃO contém dados pessoais (só contagens e valores por
 * anúncio/dia) e fica em /data, que já é ignorado pelo git. Os CSVs originais
 * (com nome/telefone/CPF) nunca são lidos pelo app em runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { readXlsx } from "./xlsx-reader";

const DEFAULT_DIR = path.join(process.env.HOME ?? "", "Desktop", "LEADS");
const leadsPath = process.argv[2] ?? path.join(DEFAULT_DIR, "TODOS OS LEADS.csv");
const paidPath = process.argv[3] ?? path.join(DEFAULT_DIR, "Leads que pagaram.csv");
const spendPath = process.argv[4] ?? path.join(DEFAULT_DIR, "valor gasto.csv");
const campaignSpendPath = process.argv[7] ?? path.join(DEFAULT_DIR, "Custo campanhas.csv");
const inad1Path = process.argv[5] ?? path.join(DEFAULT_DIR, "inadimplente 1.xlsx");
const inad2Path = process.argv[6] ?? path.join(DEFAULT_DIR, "inadimplente 2.xlsx");
const OUT = path.join(process.cwd(), "data", "leads-roi", "aggregated.json");

const NO_AD_LABEL = "(sem anúncio identificado)";
// Status que, apesar de estar na planilha de pagantes, ainda não representam pagamento.
const NOT_PAID_STATUS = new Set(["aguardando pagamento"]);
// Fuso do Brasil (sem horário de verão desde 2019).
const BR_OFFSET_SECONDS = -3 * 3600;

type Row = Record<string, string>;

function parseCSV(text: string, delimiter = ","): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = (rows.shift() ?? []).map((h) => h.replace(/^﻿/, ""));
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * Chave de agrupamento: nomes "semelhantes" viram a mesma chave.
 *  - maiúsculas/minúsculas e espaços extras: "v77" = "V77"
 *  - sufixo de cópia: "1 — Cópia" = "1"
 *  - "Ads"/"AD" colado ao número: "125Ads" = "125", "AD173" = "173", "Ads 117" = "117"
 *  - "IMAGEM 06" = "IMG06"
 *  - zeros à esquerda do número: "IMG06" = "IMG6", "C05" = "C5", "05" = "5"
 *  - nomes unidos à mão em AD_ALIASES: "5" = "125"
 */
const AD_ALIASES: Record<string, string> = {
  "5": "125",
};

function normalizeAd(name: string): string {
  const key = name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\s*[—–-]\s*c[óo]pia$/, "")
    .replace(/^imagem\s*/, "img")
    .replace(/^ads?\s*(?=\d)/, "")
    .replace(/(?<=\d)\s*ads$/, "")
    .replace(/^([a-z]*)0+(?=\d)/, "$1");
  return AD_ALIASES[key] ?? key;
}

/** Nomes no padrão letras+número (V77, IMG6, 125) aparecem em maiúsculas; o resto, como veio. */
const isCodeLike = (key: string) => /^[a-z]*\d[\w./]*$/.test(key);

function dayOf(timestamp: string): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  return new Date((ts + BR_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

const NO_CAMPAIGN_LABEL = "(sem campanha identificada)";
/** Campanhas: só maiúsculas/minúsculas e espaços extras são unificados (cópias de campanha continuam separadas). */
const normalizeCampaign = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const campaignVariants = new Map<string, Map<string, number>>([["", new Map()]]);
function touchCampaign(row: Row): string {
  const raw = (row["Nome da Campanha"] ?? "").trim();
  const key = normalizeCampaign(raw);
  let v = campaignVariants.get(key);
  if (!v) {
    v = new Map();
    campaignVariants.set(key, v);
  }
  if (raw) v.set(raw, (v.get(raw) ?? 0) + 1);
  return key;
}

interface AdAcc {
  variants: Map<string, number>;
  campaigns: Map<string, number>;
}

const ads = new Map<string, AdAcc>();
// chave: `${adKey}|${day}`
const cells = new Map<
  string,
  { ad: string; campaign: string; day: string; leads: number; sales: number; revenue: number; inad: number; inadValue: number }
>();

function touchAd(row: Row) {
  const raw = row["Nome do Anúncio"] ?? "";
  const key = normalizeAd(raw);
  let acc = ads.get(key);
  if (!acc) {
    acc = { variants: new Map(), campaigns: new Map() };
    ads.set(key, acc);
  }
  if (raw.trim()) acc.variants.set(raw.trim(), (acc.variants.get(raw.trim()) ?? 0) + 1);
  const campaign = (row["Nome da Campanha"] ?? "").trim();
  if (campaign) acc.campaigns.set(campaign, (acc.campaigns.get(campaign) ?? 0) + 1);
  return key;
}

function cell(adKey: string, campaignKey: string, day: string) {
  const k = `${adKey}|${campaignKey}|${day}`;
  let c = cells.get(k);
  if (!c) {
    c = { ad: adKey, campaign: campaignKey, day, leads: 0, sales: 0, revenue: 0, inad: 0, inadValue: 0 };
    cells.set(k, c);
  }
  return c;
}

console.log("Lendo", leadsPath);
const leads = parseCSV(fs.readFileSync(leadsPath, "utf8"));
console.log("Lendo", paidPath);
const paid = parseCSV(fs.readFileSync(paidPath, "utf8"));
console.log("Lendo", spendPath);
const spendRows = parseCSV(fs.readFileSync(spendPath, "utf8"), ";");

let leadsMin = "";
let leadsMax = "";
for (const r of leads) {
  const day = dayOf(r.timestamp);
  cell(touchAd(r), touchCampaign(r), day).leads++;
  if (day) {
    if (!leadsMin || day < leadsMin) leadsMin = day;
    if (!leadsMax || day > leadsMax) leadsMax = day;
  }
}

let paidMin = "";
let paidMax = "";
let salesCount = 0;
let salesWithoutValue = 0;
let excludedNotPaid = 0;
for (const r of paid) {
  if (NOT_PAID_STATUS.has((r.Status ?? "").trim().toLowerCase())) {
    excludedNotPaid++;
    continue;
  }
  const day = dayOf(r.timestamp);
  const value = Number.parseFloat((r.Valor ?? "").replace(",", "."));
  const c = cell(touchAd(r), touchCampaign(r), day);
  c.sales++;
  salesCount++;
  if (Number.isFinite(value)) c.revenue += value;
  else salesWithoutValue++;
  if (day) {
    if (!paidMin || day < paidMin) paidMin = day;
    if (!paidMax || day > paidMax) paidMax = day;
  }
}

// Gasto por criativo (planilha do Meta: separador ";" e decimal com vírgula).
// Nomes são normalizados como nos leads/vendas e, se dois viram a mesma chave, somados.
function parseNum(value: string | undefined): number {
  let v = (value ?? "").trim();
  if (!v) return 0;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface Spend {
  spend: number;
  impressions: number;
  linkClicks: number;
  conversations: number;
}
const spendByAd = new Map<string, Spend>();
const spendOnlyKeys: string[] = [];
let spendTotal = 0;
for (const r of spendRows) {
  const raw = (r["Criativo"] ?? "").trim();
  if (!raw || raw.toLowerCase() === "total") continue; // a planilha traz uma linha TOTAL
  const key = normalizeAd(raw);
  if (!ads.has(key)) {
    ads.set(key, { variants: new Map(), campaigns: new Map() });
    spendOnlyKeys.push(raw);
  }
  const acc = ads.get(key)!;
  acc.variants.set(raw, (acc.variants.get(raw) ?? 0) + 1);
  const s = spendByAd.get(key) ?? { spend: 0, impressions: 0, linkClicks: 0, conversations: 0 };
  s.spend += parseNum(r["Valor gasto"]);
  s.impressions += parseNum(r["Impressões"]);
  s.linkClicks += parseNum(r["Cliques no link"]);
  s.conversations += parseNum(r["Conversas iniciadas"]);
  spendByAd.set(key, s);
  spendTotal += parseNum(r["Valor gasto"]);
}

// ---------------------------------------------------------------------------
// Inadimplentes: vinculados ao lead pelo telefone e atribuídos ao anúncio dele.
// ---------------------------------------------------------------------------

/** Chave de telefone tolerante: DDD + últimos 8 dígitos (ignora +55 e o 9º dígito). */
function phoneKey(phone: string | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length < 10 ? "" : d.slice(0, 2) + d.slice(-8);
}

interface Candidate {
  ts: number;
  adKey: string;
  campaignKey: string;
  day: string;
}
function indexByPhone(rows: Row[], phoneOf: (r: Row) => string): Map<string, Candidate[]> {
  const index = new Map<string, Candidate[]>();
  for (const r of rows) {
    const raw = r["Nome do Anúncio"] ?? "";
    const k = phoneKey(phoneOf(r));
    if (!k || !raw.trim()) continue;
    const list = index.get(k) ?? [];
    list.push({ ts: Number(r.timestamp) || 0, adKey: normalizeAd(raw), campaignKey: normalizeCampaign(r["Nome da Campanha"] ?? ""), day: dayOf(r.timestamp) });
    index.set(k, list);
  }
  return index;
}
const leadsByPhone = indexByPhone(leads, (r) => r.rawPhone || r.phone);
const paidByPhone = indexByPhone(paid, (r) => r.rawPhone || r.phone);

/** Entre vários leads do mesmo telefone, usa o mais recente anterior à venda (ou o primeiro). */
function pick(list: Candidate[] | undefined, saleTs: number): Candidate | null {
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => a.ts - b.ts);
  return [...sorted].reverse().find((c) => c.ts <= saleTs) ?? sorted[0];
}

interface Inad {
  phone: string;
  ts: number; // horário da venda, em segundos (UTC)
  value: number;
}
const inadimplentes: Inad[] = [];
// Planilha 1 (logística): datas em número serial do Excel; os 3 últimos "pedidos" são linhas de total.
for (const r of readXlsx(inad1Path)) {
  if (!r["Status Entrega"]) continue;
  const serial = Number(r["Data Venda"]);
  const [h = 0, m = 0, sec = 0] = (r["Hora Venda"] ?? "").split(":").map(Number);
  const ts = Number.isFinite(serial) && serial > 0 ? (serial - 25569) * 86400 + h * 3600 + m * 60 + sec - BR_OFFSET_SECONDS : 0;
  inadimplentes.push({ phone: r["Telefone"], ts, value: Math.max(0, parseNum(r["Valor do Pedido (R$)"]) - parseNum(r["Valor Pago (R$)"])) });
}
// Planilha 2 (status "Frustrada"): data como texto no horário do Brasil.
for (const r of readXlsx(inad2Path)) {
  const t = Date.parse(`${(r["Data Venda"] ?? "").replace(" ", "T")}-03:00`);
  inadimplentes.push({ phone: r["Telefone"], ts: Number.isFinite(t) ? t / 1000 : 0, value: parseNum(r["Valor"]) });
}

let inadCount = 0;
let inadMatchedLead = 0;
let inadMatchedPaid = 0;
let inadValueTotal = 0;
const seenInad = new Set<string>();
for (const i of inadimplentes) {
  const k = phoneKey(i.phone);
  // mesma pessoa, mesmo dia e mesmo valor nas duas planilhas = o mesmo pedido
  const dedupe = `${k}|${dayOf(String(i.ts))}|${i.value}`;
  if (k && seenInad.has(dedupe)) continue;
  seenInad.add(dedupe);

  const viaLead = pick(leadsByPhone.get(k), i.ts);
  const viaPaid = viaLead ? null : pick(paidByPhone.get(k), i.ts);
  const found = viaLead ?? viaPaid;
  if (viaLead) inadMatchedLead++;
  else if (viaPaid) inadMatchedPaid++;

  // O dia segue o critério do resto da página (entrada do lead); sem lead, usa o dia da venda.
  const c = cell(found ? found.adKey : "", found ? found.campaignKey : "", found ? found.day : dayOf(String(i.ts)));
  c.inad++;
  c.inadValue += i.value;
  inadCount++;
  inadValueTotal += i.value;
}

// ---------------------------------------------------------------------------
// Custo por campanha (planilha do Meta, mesmo formato da de criativos). Os nomes do Meta e os do CRM
// (UTM) nem sempre são iguais: casa por nome exato, por tabela manual e por semelhança forte.
// ---------------------------------------------------------------------------
interface CampaignSpend {
  spend: number;
  impressions: number;
  linkClicks: number;
  conversations: number;
}
/** CRM -> Meta, confirmados à mão (mesma campanha com o nome editado). Chaves já normalizadas. */
const CAMPAIGN_ALIASES: Record<string, string> = {
  "195,196,197-[3716]": "[1-1-3] [ads 195, 196, 197]",
  "campanha base": "[1-1-11] [campanha base]",
  "menocare[1613] — — novo": "menocare[1613] —",
};
const tokens = (s: string) => {
  const t = new Set<string>();
  for (const m of s.toLowerCase().matchAll(/[a-z]*\d+[a-z]*/g)) t.add(m[0].replace(/^(ads?|ad)(?=\d)/, "").replace(/^img0*(?=\d)/, "img").replace(/^([a-z]*)0+(?=\d)/, "$1"));
  return t;
};
/** Estrutura "campanhas-conjuntos-anúncios" no nome (ex.: 1-3-1). */
const structureOf = (s: string) => /(?:^|[\s[|(])(\d)-(\d)-(\d{1,2})(?:[\]\s|)]|$)/.exec(s)?.slice(1, 4).join("-") ?? null;
const jaccard = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i || 1);
};

const campaignCost = new Map<string, CampaignSpend & { raw: string }>();
let campaignSpendTotal = 0;
if (fs.existsSync(campaignSpendPath)) {
  console.log("Lendo", campaignSpendPath);
  for (const r of parseCSV(fs.readFileSync(campaignSpendPath, "utf8"), ";")) {
    const raw = (r["Criativo"] ?? "").trim();
    if (!raw || raw.toLowerCase() === "total") continue;
    const key = normalizeCampaign(raw);
    const c = campaignCost.get(key) ?? { raw, spend: 0, impressions: 0, linkClicks: 0, conversations: 0 };
    c.spend += parseNum(r["Valor gasto"]);
    c.impressions += parseNum(r["Impressões"]);
    c.linkClicks += parseNum(r["Cliques no link"]);
    c.conversations += parseNum(r["Conversas iniciadas"]);
    campaignCost.set(key, c);
    campaignSpendTotal += parseNum(r["Valor gasto"]);
  }
}
// leads de cada campanha do CRM (para repartir quando duas campanhas apontam para a mesma linha de custo)
const campaignLeads = new Map<string, number>();
for (const c of cells.values()) campaignLeads.set(c.campaign, (campaignLeads.get(c.campaign) ?? 0) + c.leads);

const costRowOf = new Map<string, string>(); // chave da campanha do CRM -> chave da linha de custo
const aliasLog: { crm: string; meta: string; how: string }[] = [];
const costTokens = [...campaignCost.keys()].map((k) => ({ k, t: tokens(k) }));
for (const key of campaignVariants.keys()) {
  if (key === "") continue;
  if (campaignCost.has(key)) {
    costRowOf.set(key, key);
    continue;
  }
  const manual = CAMPAIGN_ALIASES[key];
  if (manual && campaignCost.has(manual)) {
    costRowOf.set(key, manual);
    aliasLog.push({ crm: key, meta: manual, how: "manual" });
    continue;
  }
  // semelhança forte: mesmos números/códigos e mesma estrutura, com folga clara sobre a segunda candidata
  // (campanhas numeradas "1 - …", "8 - …" são parecidas demais entre si e não casam)
  const t = tokens(key);
  if (t.size < 3 || (campaignLeads.get(key) ?? 0) < 100) continue;
  const st = structureOf(key);
  const scored = costTokens
    .filter((c) => !st || !structureOf(c.k) || structureOf(c.k) === st)
    .map((c) => ({ k: c.k, j: jaccard(t, c.t) }))
    .sort((a, b) => b.j - a.j);
  if (scored[0] && scored[0].j >= 0.9 && !(scored[1] && scored[1].j > scored[0].j - 0.15)) {
    costRowOf.set(key, scored[0].k);
    aliasLog.push({ crm: key, meta: scored[0].k, how: "semelhança" });
  }
}
// linhas de custo sem nenhuma campanha do CRM (ex.: tráfego para o blog) viram campanhas só com gasto
for (const [k, c] of campaignCost) {
  if (![...costRowOf.values()].includes(k)) {
    campaignVariants.set(k, new Map([[c.raw, 1]]));
    costRowOf.set(k, k);
  }
}
const campaignSpendOf = new Map<string, CampaignSpend>(); // chave da campanha -> gasto (repartido pelos leads)
for (const [costKey, c] of campaignCost) {
  const owners = [...costRowOf].filter(([, ck]) => ck === costKey).map(([crm]) => crm);
  const total = owners.reduce((s, o) => s + (campaignLeads.get(o) ?? 0), 0);
  for (const o of owners) {
    const share = total > 0 ? (campaignLeads.get(o) ?? 0) / total : o === costKey ? 1 : 0;
    campaignSpendOf.set(o, { spend: c.spend * share, impressions: c.impressions * share, linkClicks: c.linkClicks * share, conversations: c.conversations * share });
  }
}

const adKeys = [...ads.keys()].sort();
const adIndex = new Map(adKeys.map((k, i) => [k, i]));
const campaignKeys = [...campaignVariants.keys()].sort();
const campaignIndex = new Map(campaignKeys.map((k, i) => [k, i]));
const campaignList = campaignKeys.map((key) => ({
  spend: campaignSpendOf.get(key) ?? null,
  key,
  name: key === "" ? NO_CAMPAIGN_LABEL : ([...campaignVariants.get(key)!].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key),
}));
const adList = adKeys.map((key) => {
  const acc = ads.get(key)!;
  const top = (m: Map<string, number>, n: number) =>
    [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
  return {
    key,
    name: key === "" ? NO_AD_LABEL : isCodeLike(key) ? key.toUpperCase() : (top(acc.variants, 1)[0] ?? key),
    // nomes originais que foram somados neste anúncio (para conferência)
    variants: top(acc.variants, 50),
    campaignCount: acc.campaigns.size,
    campaigns: top(acc.campaigns, 5),
    spend: spendByAd.get(key) ?? null,
  };
});

// Linhas compactas: [índiceDoAnúncio, índiceDaCampanha, dia ("" = sem data), leads, vendas, receita, inadimplentes, valorInadimplente]
const rows = [...cells.values()]
  .map(
    (c) =>
      [adIndex.get(c.ad)!, campaignIndex.get(c.campaign)!, c.day, c.leads, c.sales, Math.round(c.revenue * 100) / 100, c.inad, Math.round(c.inadValue * 100) / 100] as const,
  )
  .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]));

const output = {
  generatedAt: new Date().toISOString(),
  sources: {
    leadsRows: leads.length,
    spendTotal: Math.round(spendTotal * 100) / 100,
    campaignSpendTotal: Math.round(campaignSpendTotal * 100) / 100,
    inadCount,
    inadValueTotal: Math.round(inadValueTotal * 100) / 100,
    inadMatchedLead,
    inadMatchedPaid,
    inadUnattributed: inadCount - inadMatchedLead - inadMatchedPaid,
    paidRows: paid.length,
    salesCount,
    salesWithoutValue,
    excludedNotPaid,
    leadsRange: [leadsMin, leadsMax],
    paidRange: [paidMin, paidMax],
  },
  ads: adList,
  campaigns: campaignList,
  rows,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output));
console.log(
  `OK: ${adList.length} anúncios, ${rows.length} linhas (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB) → ${path.relative(process.cwd(), OUT)}`,
);
console.log(
  `Leads: ${leads.length} (${leadsMin} → ${leadsMax}) | Vendas: ${salesCount} (${paidMin} → ${paidMax}) | sem valor: ${salesWithoutValue} | excluídas (aguardando pagamento): ${excludedNotPaid}`,
);
console.log(`Gasto: R$ ${spendTotal.toFixed(2)} em ${spendByAd.size} criativos | só no gasto (sem leads/vendas): ${spendOnlyKeys.join(", ") || "nenhum"}`);
console.log(
  `Inadimplentes: ${inadCount} (R$ ${inadValueTotal.toFixed(2)}) | vinculados por telefone ao lead: ${inadMatchedLead} (+${inadMatchedPaid} via planilha de pagantes) | sem anúncio: ${inadCount - inadMatchedLead - inadMatchedPaid}`,
);
{
  const withCost = [...campaignLeads].filter(([k]) => campaignSpendOf.has(k) && k !== "").reduce((a, [, l]) => a + l, 0);
  const all = [...campaignLeads].filter(([k]) => k !== "").reduce((a, [, l]) => a + l, 0);
  console.log(`Custo por campanha: R$ ${campaignSpendTotal.toFixed(2)} | leads em campanhas com custo: ${withCost} de ${all} (${((withCost / all) * 100).toFixed(0)}%) | casamentos por tabela/semelhança: ${aliasLog.length}`);
  for (const a of aliasLog) console.log(`  [${a.how}] ${a.crm.slice(0, 60)}  ->  ${a.meta.slice(0, 60)}`);
}
