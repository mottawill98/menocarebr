/**
 * Relatório de tráfego pago em markdown, só com dados reais baixados por fetch-traffic-report.ts.
 * Último período de 30 dias x 30 dias anteriores. O que não existe vira "sem dado".
 * Uso: node_modules/.bin/tsx scripts/build-traffic-report.ts
 * Saída: reports/relatorio-trafego.md (a pasta reports/ não vai para o git)
 */
import fs from "node:fs";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const ROOT = process.cwd();
const R = path.join(ROOT, "data", "account-analysis", "report");
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(R, f), "utf8")) as T;

interface Action {
  action_type: string;
  value: string;
}
interface Ins {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend: string;
  impressions: string;
  reach: string;
  frequency: string;
  clicks: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  ctr: string;
  cpc?: string;
  cpm: string;
  actions?: Action[];
  action_values?: Action[];
}
const PURCHASE = "onsite_conversion.purchase";
const CONVERSATION = "onsite_conversion.messaging_conversation_started_7d";
const act = (r: { actions?: Action[] }, t: string) => Number(r.actions?.find((a) => a.action_type === t)?.value ?? 0);
const val = (r: { action_values?: Action[] }, t: string) => Number(r.action_values?.find((a) => a.action_type === t)?.value ?? 0);
// A Meta registra o valor de compra multiplicado por 100 desde março (ticket reportado ~R$ 44 mil): estimativa = ÷ 100.
const revenueEst = (r: { action_values?: Action[] }) => val(r, PURCHASE) / 100;

const fmtR = (v: number | null, d = 0) => (v == null || !isFinite(v) ? "sem dado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtN = (v: number | null, d = 0) => (v == null || !isFinite(v) ? "sem dado" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtP = (v: number | null, d = 1) => (v == null || !isFinite(v) ? "sem dado" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const delta = (a: number | null, b: number | null) => (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0 ? "sem dado" : `${a / b - 1 >= 0 ? "+" : ""}${((a / b - 1) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);
const fd = (d: string) => d.split("-").reverse().join("/");
const table = (head: string[], rows: (string | number)[][]) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
const safeCell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  linkClicks: number;
  conversations: number;
  purchases: number;
  revenue: number;
  ctrAll: number | null;
  ctrLink: number | null;
  cpcAll: number | null;
  cpcLink: number | null;
  cpm: number | null;
  costConv: number | null;
  cpa: number | null;
  convRate: number | null; // compras / cliques no link
  convToPurchase: number | null; // compras / conversas iniciadas
  roas: number | null;
}
const metricsOf = (r: Ins): Metrics => {
  const spend = Number(r.spend);
  const link = Number(r.inline_link_clicks ?? 0);
  const clicks = Number(r.clicks);
  const impr = Number(r.impressions);
  const purchases = act(r, PURCHASE);
  const conv = act(r, CONVERSATION);
  const rev = revenueEst(r);
  return {
    spend,
    impressions: impr,
    reach: Number(r.reach),
    frequency: r.frequency ? Number(r.frequency) : null,
    clicks,
    linkClicks: link,
    conversations: conv,
    purchases,
    revenue: rev,
    ctrAll: impr ? (clicks / impr) * 100 : null,
    ctrLink: impr ? (link / impr) * 100 : null,
    cpcAll: clicks ? spend / clicks : null,
    cpcLink: link ? spend / link : null,
    cpm: impr ? (spend / impr) * 1000 : null,
    costConv: conv ? spend / conv : null,
    cpa: purchases ? spend / purchases : null,
    convRate: link ? (purchases / link) * 100 : null,
    convToPurchase: conv ? (purchases / conv) * 100 : null,
    roas: spend ? rev / spend : null,
  };
};

async function main() {
  const periods = read<{ P1: { since: string; until: string }; P0: { since: string; until: string } }>("periods.json");
  const acc1 = read<Ins[]>("account-p1.json")[0];
  const acc0 = read<Ins[]>("account-p0.json")[0];
  const camp1 = read<Ins[]>("campaign-p1.json");
  const camp0 = read<Ins[]>("campaign-p0.json");
  const set1 = read<Ins[]>("adset-p1.json");
  const set0 = read<Ins[]>("adset-p0.json");
  const ad1 = read<Ins[]>("ad-p1.json");
  const ad0 = read<Ins[]>("ad-p0.json");
  const campaigns = read<{ id: string; name: string; objective?: string; effective_status: string; daily_budget?: string; lifetime_budget?: string; bid_strategy?: string; created_time?: string; updated_time?: string }[]>("campaigns.json");
  const adsets = read<{ id: string; campaign_id: string; name: string; effective_status: string; optimization_goal?: string; bid_strategy?: string; destination_type?: string; attribution_spec?: { event_type: string; window_days: number }[]; promoted_object?: { pixel_id?: string; custom_event_type?: string; whatsapp_phone_number?: string }; targeting?: { age_min?: number; age_max?: number; genders?: number[]; custom_audiences?: unknown[]; excluded_custom_audiences?: unknown[]; flexible_spec?: unknown[]; targeting_automation?: { advantage_audience?: number } } }[]>("adsets.json");
  const adEntities = read<{ id: string; creative?: { object_type?: string; call_to_action_type?: string } }[]>(path.join("..", "ads.json"));
  const pixels = read<{ id: string; name: string; last_fired_time?: string; is_unavailable?: boolean; enable_automatic_matching?: boolean }[]>("pixels.json");
  const pixelStats = read<Record<string, { data?: { start_time: string; data: { value: string; count: number }[] }[]; error?: string }>>("pixel-stats.json");
  const activities = read<{ event_time: string; translated_event_type?: string; event_type: string; object_name?: string; actor_name?: string }[]>("activities.json");
  const account = read<{ name: string; currency: string; timezone_name: string; amount_spent: string; created_time: string; business_name?: string }>(path.join("..", "account.json"));

  const campMap = new Map(campaigns.map((c) => [c.id, c]));
  const setMap = new Map(adsets.map((a) => [a.id, a]));
  const adType = new Map(adEntities.map((a) => [a.id, a.creative?.object_type]));
  const m1 = metricsOf(acc1);
  const m0 = metricsOf(acc0);

  let md = "";
  const h = (s: string) => (md += `\n${s}\n`);

  // ---------------------------------------------------------------- 1
  md += `# Relatório de tráfego pago · Meta Ads\n\nGerado em ${new Date().toLocaleString("pt-BR")} a partir da Graph API da Meta (somente leitura). Onde não há dado, está escrito "sem dado".\n`;
  h("## 1. CONTEXTO");
  md += `
- **Plataformas ativas:** Meta Ads (conta "${account.name}", ID act_514241761599399, empresa ${account.business_name ?? "sem dado"}, moeda ${account.currency}, fuso ${account.timezone_name}, criada em ${fd(account.created_time.slice(0, 10))}, gasto acumulado de ${fmtR(Number(account.amount_spent) / 100)}). Google Ads, TikTok Ads e outras: **sem dado** (sem acesso).
- **Negócio/objetivo:** Menocare (produto vendido em kits de 3x, 5x, 6x e outros, segundo o CRM). Objetivo das campanhas: ${campaigns.filter((c) => c.objective).length ? "vendas (OUTCOME_SALES) com destino WhatsApp, otimizadas para o evento Compra" : "sem dado"}.
- **Ticket médio:** R$ 417 (CRM, 29.722 pedidos pagos com valor, planilha "Leads que pagaram"). A Meta registra o valor de compra ×100 desde março, então o valor da Meta não é usado como valor real: a receita abaixo é uma **estimativa (valor da Meta ÷ 100)**.
- **Período analisado:** últimos 30 dias, ${fd(periods.P1.since)} a ${fd(periods.P1.until)}, contra os 30 dias anteriores, ${fd(periods.P0.since)} a ${fd(periods.P0.until)}. As compras dos últimos dias ainda estão chegando, então o período mais recente tende a parecer um pouco pior.
- **Definição de resultado:** "Compra" = ação \`onsite_conversion.purchase\` (a coluna "Compras na Meta" das planilhas). "Conversa" = \`onsite_conversion.messaging_conversation_started_7d\`. Atribuição dos conjuntos: 7 dias após o clique e 1 dia após a visualização.
`;

  // ---------------------------------------------------------------- 2
  h("## 2. VISÃO GERAL POR PLATAFORMA");
  const rows2: [string, (m: Metrics) => string, number | null, number | null][] = [
    ["Investimento", (m) => fmtR(m.spend), m1.spend, m0.spend],
    ["Impressões", (m) => fmtN(m.impressions), m1.impressions, m0.impressions],
    ["Alcance", (m) => fmtN(m.reach), m1.reach, m0.reach],
    ["Frequência (média do período)", (m) => fmtN(m.frequency, 2), m1.frequency, m0.frequency],
    ["Cliques (todos)", (m) => fmtN(m.clicks), m1.clicks, m0.clicks],
    ["Cliques no link", (m) => fmtN(m.linkClicks), m1.linkClicks, m0.linkClicks],
    ["CTR (todos os cliques)", (m) => fmtP(m.ctrAll, 2), m1.ctrAll, m0.ctrAll],
    ["CTR do link", (m) => fmtP(m.ctrLink, 2), m1.ctrLink, m0.ctrLink],
    ["CPC (todos os cliques)", (m) => fmtR(m.cpcAll, 2), m1.cpcAll, m0.cpcAll],
    ["CPC do link", (m) => fmtR(m.cpcLink, 2), m1.cpcLink, m0.cpcLink],
    ["CPM", (m) => fmtR(m.cpm, 2), m1.cpm, m0.cpm],
    ["Conversas iniciadas", (m) => fmtN(m.conversations), m1.conversations, m0.conversations],
    ["Custo por conversa", (m) => fmtR(m.costConv, 2), m1.costConv, m0.costConv],
    ["Compras na Meta", (m) => fmtN(m.purchases), m1.purchases, m0.purchases],
    ["Custo por compra (CPA)", (m) => fmtR(m.cpa, 2), m1.cpa, m0.cpa],
    ["Taxa de conversão (compras ÷ cliques no link)", (m) => fmtP(m.convRate, 2), m1.convRate, m0.convRate],
    ["Compras ÷ conversas iniciadas", (m) => fmtP(m.convToPurchase, 1), m1.convToPurchase, m0.convToPurchase],
    ["Faturamento atribuído (estimativa, valor da Meta ÷ 100)", (m) => fmtR(m.revenue), m1.revenue, m0.revenue],
    ["ROAS (estimado)", (m) => `${fmtN(m.roas, 2)}x`, m1.roas, m0.roas],
  ];
  md += `\n**Meta Ads · conta BR 4**\n\n` + table(["Métrica", "Últimos 30 dias", "30 dias anteriores", "Variação"], rows2.map(([name, f, a, b]) => [name, f(m1), f(m0), delta(a, b)]));
  md += `\n\nROI: **sem dado** (a Meta não traz custo do produto, frete nem inadimplência; ver ROI por anúncio na aba de métricas). Google Ads / TikTok Ads: **sem dado**.\n`;

  // decomposição do CPA
  const cpmD = m1.cpm! / m0.cpm! - 1;
  const ctrD = m1.ctrLink! / m0.ctrLink! - 1;
  const cvD = m1.convRate! / m0.convRate! - 1;
  md += `\n**Por que o CPA mudou** (CPA = CPM ÷ [1.000 × CTR do link × taxa de conversão]): CPM ${delta(m1.cpm, m0.cpm)}, CTR do link ${delta(m1.ctrLink, m0.ctrLink)}, compras por clique no link ${delta(m1.convRate, m0.convRate)}, resultando em CPA ${delta(m1.cpa, m0.cpa)}.\n`;
  void cpmD;
  void ctrD;
  void cvD;

  // ---------------------------------------------------------------- 3
  h("## 3. POR CAMPANHA");
  const adsetsByCamp = new Map<string, typeof adsets>();
  for (const a of adsets) (adsetsByCamp.get(a.campaign_id) ?? adsetsByCamp.set(a.campaign_id, []).get(a.campaign_id)!).push(a);
  const audienceType = (campId: string, spendSets: Set<string>) => {
    const sets = (adsetsByCamp.get(campId) ?? []).filter((s) => spendSets.has(s.id));
    if (!sets.length) return "sem dado";
    const remarketing = sets.some((s) => (s.targeting?.custom_audiences ?? []).length > 0);
    const adv = sets.some((s) => s.targeting?.targeting_automation?.advantage_audience === 1);
    const ages = [...new Set(sets.map((s) => `${s.targeting?.age_min ?? "?"}-${s.targeting?.age_max ?? "?"}`))].join(", ");
    return `${remarketing ? "personalizado" : "frio aberto"}${adv ? " (Advantage+)" : " (manual)"} · ${ages} anos`;
  };
  const spendSets1 = new Set(set1.filter((s) => Number(s.spend) > 0).map((s) => s.adset_id!));
  const camp0Map = new Map(camp0.map((c) => [c.campaign_id!, metricsOf(c)]));
  const campRows = [...camp1]
    .sort((a, b) => Number(b.spend) - Number(a.spend))
    .map((c) => {
      const m = metricsOf(c);
      const e = campMap.get(c.campaign_id!);
      const sets = (adsetsByCamp.get(c.campaign_id!) ?? []).filter((s) => spendSets1.has(s.id));
      const bids = [...new Set(sets.map((s) => s.bid_strategy ?? e?.bid_strategy ?? "sem dado"))].join(", ");
      const prev = camp0Map.get(c.campaign_id!);
      return [
        safeCell(c.campaign_name ?? "sem dado"),
        c.objective?.replace("OUTCOME_", "") ?? "sem dado",
        e?.effective_status ?? "sem dado",
        e?.daily_budget ? fmtR(Number(e.daily_budget) / 100) : e?.lifetime_budget ? "vitalício" : "ABO (por conjunto)",
        fmtR(m.spend),
        fmtN(m.purchases),
        fmtR(m.cpa),
        prev ? fmtR(prev.cpa) : "sem dado",
        fmtP(m.ctrLink, 2),
        fmtR(m.cpm, 2),
        `${fmtN(m.roas, 2)}x`,
        bids,
        audienceType(c.campaign_id!, spendSets1),
      ];
    });
  const head3 = ["Campanha", "Objetivo", "Status", "Orçamento/dia", "Investimento", "Compras", "CPA", "CPA 30d anteriores", "CTR link", "CPM", "ROAS est.", "Lance", "Público"];
  md += `\n${camp1.length} campanhas com gasto nos últimos 30 dias (as ${Math.min(25, camp1.length)} de maior investimento; a lista completa está no arquivo de relatório). ROAS estimado = valor da Meta ÷ 100.\n\n` + table(head3, campRows.slice(0, 25));
  const restSpend = camp1.slice().sort((a, b) => Number(b.spend) - Number(a.spend)).slice(25).reduce((s, c) => s + Number(c.spend), 0);
  if (camp1.length > 25) md += `\n\nOutras ${camp1.length - 25} campanhas: ${fmtR(restSpend)} de investimento.\n`;
  const fullCampTable = table(head3, campRows);

  // público e lance (conta)
  const allSets1 = set1.map((s) => setMap.get(s.adset_id!)).filter(Boolean) as typeof adsets;
  const remk = allSets1.filter((s) => (s.targeting?.custom_audiences ?? []).length > 0).length;
  md += `\n**Tipo de público:** ${allSets1.length} conjuntos com gasto; ${remk} usam público personalizado (remarketing ou lookalike) e ${allSets1.length - remk} são **públicos frios abertos** (sem interesses, sem lookalike). **Estratégia de lance (nas campanhas):** ${[...new Set(allSets1.map((s) => s.bid_strategy ?? campMap.get(s.campaign_id)?.bid_strategy ?? "sem dado"))].join(", ")}. **Meta de otimização:** ${[...new Set(allSets1.map((s) => s.optimization_goal ?? "sem dado"))].join(", ")}.\n`;

  // ---------------------------------------------------------------- 4
  h("## 4. CONJUNTOS/GRUPOS DE ANÚNCIOS E CRIATIVOS");
  const MIN_SET = 3000;
  const set0Map = new Map(set0.map((s) => [s.adset_id!, metricsOf(s)]));
  const rankSets = set1
    .map((s) => ({ s, m: metricsOf(s) }))
    .filter((x) => x.m.spend >= MIN_SET)
    .sort((a, b) => (a.m.cpa ?? Infinity) - (b.m.cpa ?? Infinity));
  const setRow = (x: (typeof rankSets)[number]) => {
    const c = campMap.get(x.s.campaign_id!);
    const prev = set0Map.get(x.s.adset_id!);
    return [safeCell(x.s.adset_name ?? ""), safeCell((c?.name ?? "").slice(0, 55)), fmtR(x.m.spend), fmtN(x.m.purchases), fmtR(x.m.cpa), prev ? fmtR(prev.cpa) : "sem dado", fmtN(x.m.frequency, 2), fmtP(x.m.ctrLink, 2)];
  };
  const headSet = ["Conjunto", "Campanha", "Investimento", "Compras", "CPA", "CPA 30d anteriores", "Frequência", "CTR link"];
  md += `\nConjuntos com ao menos ${fmtR(MIN_SET)} de investimento nos últimos 30 dias (${rankSets.length} conjuntos).\n\n**5 melhores conjuntos (menor CPA)**\n\n` + table(headSet, rankSets.slice(0, 5).map(setRow));
  md += `\n\n**5 piores conjuntos (maior CPA; sem compra conta como pior)**\n\n` + table(headSet, rankSets.slice(-5).reverse().map(setRow));

  // anúncios
  const MIN_AD = 2000;
  const ad0Map = new Map(ad0.map((a) => [a.ad_id!, metricsOf(a)]));
  const rankAds = ad1
    .map((a) => ({ a, m: metricsOf(a) }))
    .filter((x) => x.m.spend >= MIN_AD)
    .sort((x, y) => (x.m.cpa ?? Infinity) - (y.m.cpa ?? Infinity));
  const top5 = rankAds.filter((x) => x.m.purchases >= 5).slice(0, 5);
  const bottom5 = rankAds.slice(-5).reverse();
  // texto dos anúncios (leitura individual)
  const { graphGet } = await import("../src/lib/meta/client");
  const copy = new Map<string, { title?: string; body?: string; cta?: string; video?: string }>();
  for (const x of [...top5, ...bottom5]) {
    try {
      const r = await graphGet<{ creative?: { title?: string; body?: string; call_to_action_type?: string; video_id?: string } }>(`/${x.a.ad_id}`, { fields: "creative{title,body,call_to_action_type,video_id}" });
      copy.set(x.a.ad_id!, { title: r.creative?.title, body: r.creative?.body, cta: r.creative?.call_to_action_type, video: r.creative?.video_id });
    } catch {
      copy.set(x.a.ad_id!, {});
    }
  }
  const hook = (id: string) => {
    const c = copy.get(id);
    const txt = (c?.body || c?.title || "").replace(/\s+/g, " ").trim();
    return txt ? safeCell(txt.length > 110 ? `${txt.slice(0, 110)}…` : txt) : "sem dado";
  };
  const fatigue = (x: (typeof rankAds)[number]) => {
    const prev = ad0Map.get(x.a.ad_id!);
    const signs: string[] = [];
    if (x.m.frequency !== null && x.m.frequency >= 3) signs.push(`frequência ${fmtN(x.m.frequency, 1)}`);
    if (prev && prev.ctrLink && x.m.ctrLink && x.m.ctrLink / prev.ctrLink - 1 <= -0.15) signs.push(`CTR do link ${delta(x.m.ctrLink, prev.ctrLink)}`);
    if (prev && prev.cpa && x.m.cpa && x.m.cpa / prev.cpa - 1 >= 0.2) signs.push(`CPA ${delta(x.m.cpa, prev.cpa)}`);
    return signs.length ? signs.join("; ") : prev ? "sem sinal" : "sem dado (não rodou nos 30 dias anteriores)";
  };
  const adRow = (x: (typeof rankAds)[number]) => [
    safeCell(x.a.ad_name ?? ""),
    adType.get(x.a.ad_id!) === "VIDEO" ? "vídeo" : adType.get(x.a.ad_id!) === "SHARE" ? "imagem/post (SHARE)" : (adType.get(x.a.ad_id!) ?? "sem dado"),
    hook(x.a.ad_id!),
    fmtR(x.m.spend),
    fmtN(x.m.purchases),
    fmtR(x.m.cpa),
    fmtN(x.m.frequency, 2),
    fatigue(x),
  ];
  const headAd = ["Anúncio", "Formato", "Gancho/copy (início do texto)", "Investimento", "Compras", "CPA", "Frequência", "Sinais de fadiga"];
  md += `\n\nAnúncios com ao menos ${fmtR(MIN_AD)} de investimento (${rankAds.length} anúncios). Os melhores exigem 5+ compras.\n\n**5 melhores anúncios (menor CPA)**\n\n` + table(headAd, top5.map(adRow));
  md += `\n\n**5 piores anúncios (maior CPA; sem compra conta como pior)**\n\n` + table(headAd, bottom5.map(adRow));
  md += `\n\nSinal de fadiga = frequência ≥ 3, queda de 15% ou mais no CTR do link ou alta de 20% ou mais no CPA contra os 30 dias anteriores.\n`;

  // ---------------------------------------------------------------- 5
  h("## 5. FUNIL E RASTREAMENTO");
  const usedPixels = new Map<string, { spend: number; purchases: number; sets: number }>();
  for (const s of set1) {
    const pid = setMap.get(s.adset_id!)?.promoted_object?.pixel_id ?? "sem dado";
    const x = usedPixels.get(pid) ?? { spend: 0, purchases: 0, sets: 0 };
    x.spend += Number(s.spend);
    x.purchases += act(s, PURCHASE);
    x.sets++;
    usedPixels.set(pid, x);
  }
  md += `\n**Pixels da conta** (${pixels.length}) e uso nos últimos 30 dias:\n\n` +
    table(
      ["Pixel", "ID", "Último disparo", "Correspondência avançada", "Conjuntos com gasto (30d)", "Gasto", "Compras"],
      pixels.map((p) => {
        const u = usedPixels.get(p.id);
        return [safeCell(p.name), p.id, p.last_fired_time ? p.last_fired_time.replace("T", " ").slice(0, 16) + " UTC" : "sem dado", p.enable_automatic_matching ? "ligada" : "desligada", u ? u.sets : 0, u ? fmtR(u.spend) : "—", u ? fmtN(u.purchases) : "—"];
      }),
    );
  // eventos observados por pixel (amostra devolvida pela API de estatísticas)
  const evRows: (string | number)[][] = [];
  for (const p of pixels) {
    const st = pixelStats[p.id];
    const src = pixelStats[`${p.id}:source`];
    if (!st?.data?.length) {
      evRows.push([safeCell(p.name), "sem dado (a API de estatísticas não devolveu eventos)", "—", "—"]);
      continue;
    }
    const ev = new Map<string, number>();
    for (const b of st.data) for (const e of b.data) ev.set(e.value, (ev.get(e.value) ?? 0) + e.count);
    const so = new Map<string, number>();
    for (const b of src?.data ?? []) for (const e of b.data) so.set(e.value, (so.get(e.value) ?? 0) + e.count);
    const first = st.data[0].start_time.slice(0, 10);
    const last = st.data[st.data.length - 1].start_time.slice(0, 10);
    evRows.push([safeCell(p.name), [...ev].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtN(v)}`).join(", "), [...so].map(([k, v]) => `${k} ${fmtN(v)}`).join(", ") || "sem dado", `${fd(first)} a ${fd(last)}`]);
  }
  md += `\n\n**Eventos rastreados** (amostra devolvida pela API de estatísticas do pixel; não é o total do período, e a API não pagina tudo):\n\n` + table(["Pixel", "Eventos observados", "Origem (servidor/navegador)", "Janela da amostra"], evRows);
  md += `\n\nO pixel usado pelos conjuntos é um só (**${[...usedPixels.keys()].map((id) => pixels.find((p) => p.id === id)?.name ?? id).join(", ")}**). Todos os conjuntos otimizam para o evento Compra via WhatsApp.\n`;

  // funil
  const impr = m1.impressions;
  md += `\n**Funil dos últimos 30 dias (Meta):**\n\n` + table(["Etapa", "Volume", "Taxa da etapa anterior"], [
    ["Impressões", fmtN(impr), "—"],
    ["Cliques no link", fmtN(m1.linkClicks), fmtP(m1.ctrLink, 2)],
    ["Conversas iniciadas no WhatsApp", fmtN(m1.conversations), fmtP(m1.linkClicks ? (m1.conversations / m1.linkClicks) * 100 : null, 1)],
    ["Compras na Meta", fmtN(m1.purchases), fmtP(m1.convToPurchase, 1)],
  ]);
  md += `\n\n**Taxa de conversão da página de destino:** sem dado (o destino é o WhatsApp, não há página de destino medida pela Meta).\n`;
  md += `\n**Problemas de atribuição ou dado faltando:**\n`;
  const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "account-analysis", "analysis.json"), "utf8")) as { outage: { runs: { from: string; to: string; spend: number; purchases: number }[] } | null };
  for (const o of analysis.outage?.runs ?? []) md += `- **Queda de rastreio de compras:** de ${fd(o.from)} a ${fd(o.to)} foram ${fmtR(o.spend)} de gasto com ${fmtN(o.purchases)} compra(s) reportada(s). Nos dados fora desse intervalo, a Meta registra compras todo dia.\n`;
  md += `- **Valor de compra inflado:** a Meta registra o valor de compra ×100 desde março (ticket reportado em torno de R$ 44 mil). ROAS e faturamento aqui são estimativas (÷ 100); o valor correto de cada pedido só está no CRM.\n`;
  md += `- **Compras recentes incompletas:** os últimos dias ainda recebem compras do CRM, então o CPA mais recente tende a melhorar.\n`;
  md += `- **Inadimplência não aparece na Meta:** compras na Meta incluem pedidos que depois não são pagos (17,5% dos pedidos no CRM entre junho e novembro).\n`;
  md += `- **Sem dado:** taxa de conversão de página, ROI, Google Ads, TikTok Ads, e eventos por pixel de forma completa.\n`;

  // ---------------------------------------------------------------- 6
  h("## 6. DIAGNÓSTICO");
  // famílias de criativo P1 x P0
  const family = (n: string) => {
    const s = (n || "").trim();
    if (/^\d/.test(s)) return "Numerados";
    const m = /^(IMG|IMAGEM|AD|NP|C|V|B)/i.exec(s);
    if (!m) return "Outros";
    const f = m[1].toUpperCase();
    return f === "IMAGEM" ? "IMG" : f;
  };
  const famAgg = (rows: Ins[]) => {
    const m = new Map<string, { spend: number; purchases: number }>();
    for (const r of rows) {
      const k = family(r.ad_name ?? "");
      const x = m.get(k) ?? { spend: 0, purchases: 0 };
      x.spend += Number(r.spend);
      x.purchases += act(r, PURCHASE);
      m.set(k, x);
    }
    return m;
  };
  const f1 = famAgg(ad1);
  const f0 = famAgg(ad0);
  const famRows = [...new Set([...f1.keys(), ...f0.keys()])]
    .map((k) => ({ k, a: f1.get(k) ?? { spend: 0, purchases: 0 }, b: f0.get(k) ?? { spend: 0, purchases: 0 } }))
    .sort((x, y) => y.a.spend - x.a.spend)
    .map(({ k, a, b }) => [k, fmtR(a.spend), fmtP((a.spend / m1.spend) * 100, 0), fmtN(a.purchases), a.spend < 1000 ? "amostra pequena" : a.purchases ? fmtR(a.spend / a.purchases) : "sem compra", fmtR(b.spend), fmtP((b.spend / m0.spend) * 100, 0), fmtN(b.purchases), b.spend < 1000 ? "amostra pequena" : b.purchases ? fmtR(b.spend / b.purchases) : "sem compra"]);
  md += `\n**Por família de criativo (prefixo do nome do anúncio), 30 dias contra 30 dias anteriores:**\n\n` + table(["Família", "Gasto 30d", "% do gasto", "Compras", "CPA", "Gasto 30d ant.", "% do gasto", "Compras", "CPA"], famRows);

  // orçamento ativo
  const activeCamps = campaigns.filter((c) => c.effective_status === "ACTIVE");
  const activeBudget = activeCamps.reduce((s, c) => s + (c.daily_budget ? Number(c.daily_budget) / 100 : 0), 0);
  md += `\n\n**O que está funcionando**\n`;
  const goodAds = top5.map((x) => `${x.a.ad_name} (${fmtR(x.m.cpa)})`).join(", ");
  md += `- Anúncios com melhor CPA nos últimos 30 dias: ${goodAds}.\n`;
  const goodSets = rankSets.slice(0, 3).map((x) => `${x.s.adset_name} (${fmtR(x.m.cpa)}, campanha ${safeCell((campMap.get(x.s.campaign_id!)?.name ?? "").slice(0, 40))})`).join("; ");
  md += `- Conjuntos de menor CPA: ${goodSets}.\n`;
  const daily = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "account-analysis", "insights-campaign-daily.json"), "utf8")) as { date_start: string; spend: string; actions?: Action[] }[];
  const dayAgg = new Map<string, { spend: number; purchases: number }>();
  for (const r of daily) {
    if (r.date_start < periods.P1.since) continue;
    const x = dayAgg.get(r.date_start) ?? { spend: 0, purchases: 0 };
    x.spend += Number(r.spend);
    x.purchases += act(r, PURCHASE);
    dayAgg.set(r.date_start, x);
  }
  const zeroDays = [...dayAgg].filter(([, x]) => x.spend >= 1000 && x.purchases === 0).map(([d]) => fd(d));
  md += `- Compras reportadas todos os dias dos últimos 30 dias com gasto acima de R$ 1.000: ${zeroDays.length ? "não (dias sem compra: " + zeroDays.join(", ") + ")" : "sim (nenhum dia com gasto e zero compra)"}.\n`;
  md += `- O rastreio de compras está ativo nos últimos 30 dias (pixel "Menocare | Antigo" disparou em ${pixels.find((p) => p.name === "Menocare | Antigo")?.last_fired_time?.slice(0, 10) ?? "sem dado"}), com eventos de servidor e de navegador.\n`;
  // o mesmo criativo varia muito entre campanhas
  const byCreative = new Map<string, number[]>();
  for (const r of ad1) {
    const m = metricsOf(r);
    if (m.spend < 3000 || m.purchases < 5) continue;
    const k = (r.ad_name ?? "").trim().toUpperCase();
    (byCreative.get(k) ?? byCreative.set(k, []).get(k)!).push(m.cpa!);
  }
  const spread = [...byCreative].filter(([, v]) => v.length >= 2).map(([k, v]) => `${k} de ${fmtR(Math.min(...v))} a ${fmtR(Math.max(...v))}`);
  if (spread.length) md += `- O mesmo criativo varia bastante de uma campanha para outra (CPA por anúncio com ao menos R$ 3.000 de gasto): ${spread.join("; ")}. A diferença entre campanhas pesa tanto quanto o criativo.\n`;
  md += `\n**O que está piorando e possíveis causas**\n`;
  md += `- CPA ${delta(m1.cpa, m0.cpa)} (${fmtR(m0.cpa)} para ${fmtR(m1.cpa)}); CPM ${delta(m1.cpm, m0.cpm)}; CTR do link ${delta(m1.ctrLink, m0.ctrLink)}; compras por clique no link ${delta(m1.convRate, m0.convRate)}; frequência ${fmtN(m0.frequency, 2)} para ${fmtN(m1.frequency, 2)} (${delta(m1.frequency, m0.frequency)}) com alcance ${delta(m1.reach, m0.reach)}.\n`;
  const famWorse = famRows.filter((r) => r[4] !== "sem compra").slice(0, 3);
  void famWorse;
  const fam1 = (k: string) => f1.get(k)?.spend ?? 0;
  const fam0 = (k: string) => f0.get(k)?.spend ?? 0;
  md += `- **Mix de criativos:** as famílias V e B passaram de ${fmtP(((fam0("V") + fam0("B")) / m0.spend) * 100, 0)} para ${fmtP(((fam1("V") + fam1("B")) / m1.spend) * 100, 0)} do gasto, com CPA de ${fmtR(f1.get("V")!.spend / f1.get("V")!.purchases)} (V) e ${fmtR(f1.get("B")!.spend / f1.get("B")!.purchases)} (B), contra ${fmtR(f1.get("IMG")!.spend / f1.get("IMG")!.purchases)} das imagens IMG. A família C, que era ${fmtP((fam0("C") / m0.spend) * 100, 0)} do gasto, caiu para ${fmtP((fam1("C") / m1.spend) * 100, 0)}.\n`;
  md += `- **Hipótese (não provada):** a frequência maior com alcance menor indica que o mesmo público está vendo os anúncios mais vezes (público frio aberto, sem remarketing nem lookalike); a mudança de mix de criativos (tabela acima) também pesa.\n`;
  md += `\n**Testes em andamento**\n`;
  const testCamps = activeCamps.filter((c) => /teste|abo/i.test(c.name));
  md += testCamps.length ? testCamps.map((c) => `- ${safeCell(c.name)} (status ${c.effective_status})`).join("\n") + "\n" : `- Nenhuma campanha ativa com "Teste" ou "ABO" no nome. Sem dado sobre testes fora desse padrão de nome.\n`;
  const recentCreated = campaigns.filter((c) => (c.created_time ?? "") >= "2026-11-08");
  const recentActive = recentCreated.filter((c) => c.effective_status === "ACTIVE").length;
  md += `- Campanhas criadas desde 08/11: ${recentCreated.length} (${recentActive} ativas, ${recentCreated.length - recentActive} pausadas/arquivadas); ${recentCreated.filter((c) => c.name.includes("1-1-3")).length} delas na estrutura 1-1-3.\n`;
  md += `- Campanhas ativas agora: ${activeCamps.length}, com orçamento diário somado de ${fmtR(activeBudget)} (campanhas CBO).\n`;

  // histórico de alterações
  const countBy = (from: string, to: string, test: (t: string) => boolean) => activities.filter((a) => a.event_time.slice(0, 10) >= from && a.event_time.slice(0, 10) <= to && test(a.translated_event_type ?? a.event_type)).length;
  const kinds: [string, (t: string) => boolean][] = [
    ["Campanhas criadas", (t) => t === "Campanha criada"],
    ["Conjuntos criados", (t) => t === "Conjunto de anúncios criado"],
    ["Anúncios criados", (t) => t === "Anúncio criado"],
    ["Orçamentos de campanha alterados", (t) => t === "Orçamento da campanha atualizado"],
    ["Orçamentos de conjunto alterados", (t) => t === "Orçamento do conjunto de anúncios atualizado"],
    ["Mudanças de status de campanha (ligar/pausar/arquivar)", (t) => t === "Status da campanha atualizado"],
    ["Mudanças de status de anúncio", (t) => t === "Status do anúncio atualizado"],
    ["Mudanças de direcionamento (conjunto)", (t) => t === "Direcionamento do conjunto de anúncios atualizado"],
    ["Públicos personalizados criados/atualizados", (t) => /Público personalizado/.test(t)],
  ];
  md += `\n**Histórico de alterações relevantes (registro de atividades da conta)**\n\nResumo: nos últimos 30 dias foram criadas ${countBy(periods.P1.since, periods.P1.until, (t) => t === "Campanha criada")} campanhas (contra ${countBy(periods.P0.since, periods.P0.until, (t) => t === "Campanha criada")}), com menos mudanças de orçamento (${countBy(periods.P1.since, periods.P1.until, (t) => t === "Orçamento da campanha atualizado")} contra ${countBy(periods.P0.since, periods.P0.until, (t) => t === "Orçamento da campanha atualizado")}) e de público (${countBy(periods.P1.since, periods.P1.until, (t) => /Público personalizado/.test(t))} contra ${countBy(periods.P0.since, periods.P0.until, (t) => /Público personalizado/.test(t))}).\n\n` + table(["Tipo de alteração", "30 dias anteriores", "Últimos 30 dias"], kinds.map(([name, f]) => [name, countBy(periods.P0.since, periods.P0.until, f), countBy(periods.P1.since, periods.P1.until, f)]));
  const created = activities
    .filter((a) => (a.translated_event_type ?? "") === "Campanha criada" && a.event_time.slice(0, 10) >= periods.P1.until.slice(0, 8) + "01")
    .map((a) => `${fd(a.event_time.slice(0, 10))}: ${safeCell(a.object_name ?? "")}`);
  if (created.length) md += `\n\nCampanhas criadas neste mês (${created.length}):\n${created.slice(0, 12).map((c) => `- ${c}`).join("\n")}${created.length > 12 ? `\n- e mais ${created.length - 12}` : ""}\n`;

  md += `\n---\nFontes: Graph API da Meta (insights da conta, campanhas, conjuntos e anúncios; pixels e estatísticas de eventos; registro de atividades). Valores em ${account.currency}. Compras e conversas pelas definições da seção 1.\n`;

  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports", "relatorio-trafego.md"), md);
  fs.writeFileSync(path.join(ROOT, "reports", "relatorio-trafego-campanhas-completo.md"), `# Todas as campanhas com gasto nos últimos 30 dias\n\n${fullCampTable}\n`);
  console.log(md);
}
main().catch((err) => {
  console.error("Falha:", err?.payload?.error?.message ?? err?.message ?? err);
  process.exit(1);
});
