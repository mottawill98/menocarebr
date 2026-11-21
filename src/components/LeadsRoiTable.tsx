"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Info, Search, X } from "lucide-react";
import { formatDate, formatMoney, formatNumber, formatPercent, formatRoas } from "@/lib/format";
import type { LeadsRoiData } from "@/lib/leads-roi";

type NumericKey =
  | "spend"
  | "impressions"
  | "cpm"
  | "ctr"
  | "conversations"
  | "costPerConv"
  | "leads"
  | "cpl"
  | "sales"
  | "conversion"
  | "cpa"
  | "inad"
  | "inadRate"
  | "inadValue"
  | "revenue"
  | "productCost"
  | "roas"
  | "profit"
  | "roi";
type SortKey = "name" | NumericKey;
type CostMode = "real" | "manual";
type ViewMode = "ad" | "camp";

interface Row {
  /** Chave do CPL manual: o anúncio, ou "c:" + a campanha. */
  id: string;
  name: string;
  /** Linha de apoio sob o nome (nomes unidos, nº de campanhas ou de anúncios). */
  sub: string;
  /** Texto em minúsculas usado na pesquisa. */
  search: string;
  isUnknown: boolean;
  // Meta (planilha de gasto); null quando o criativo não está na planilha
  spend: number | null;
  impressions: number | null;
  clicks: number;
  cpm: number | null;
  ctr: number | null;
  conversations: number | null;
  costPerConv: number | null;
  // Funil
  leads: number;
  cpl: number | null;
  customCpl: boolean;
  sales: number;
  conversion: number | null;
  cost: number | null;
  cpa: number | null;
  // Inadimplência (pedidos enviados e não pagos)
  inad: number;
  inadRate: number | null;
  inadValue: number;
  // Resultado
  revenue: number;
  productCost: number;
  roas: number | null;
  profit: number | null;
  roi: number | null;
}

interface Totals {
  spend: number;
  impressions: number;
  cpm: number | null;
  ctr: number | null;
  conversations: number;
  costPerConv: number | null;
  leads: number;
  cpl: number | null;
  sales: number;
  conversion: number | null;
  cost: number;
  cpa: number | null;
  inad: number;
  inadRate: number | null;
  inadValue: number;
  revenue: number;
  productCost: number;
  roas: number | null;
  profit: number;
  roi: number | null;
  uncosted: number;
}

const STORAGE_KEY = "leads-roi:v1";
/** Custo por venda paga (produto, frete e demais custos), em reais. */
const DEFAULT_UNIT_COST = "80";

/** Aceita "1,50" ou "1.50"; vazio/inválido/≤0 → null. */
function parseMoney(value: string): number | null {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shiftDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function roiClass(value: number | null): string {
  if (value === null) return "text-ink-muted";
  return value >= 0 ? "text-success-text" : "text-status-critical";
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

interface SavedState {
  globalCpl: string;
  overrides: Record<string, string>;
  costMode: CostMode;
  discountInad: boolean;
  unitCost: string;
}

function readSaved(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SavedState> | null;
    return {
      globalCpl: saved?.globalCpl ?? "",
      overrides: saved?.overrides ?? {},
      costMode: saved?.costMode === "manual" ? "manual" : "real",
      discountInad: saved?.discountInad !== false,
      unitCost: saved?.unitCost ?? DEFAULT_UNIT_COST,
    };
  } catch {
    return { globalCpl: "", overrides: {}, costMode: "real", discountInad: true, unitCost: DEFAULT_UNIT_COST };
  }
}

const subscribeNoop = () => () => {};

export function LeadsRoiTable({ data }: { data: LeadsRoiData }) {
  // O CPL digitado fica salvo no navegador (localStorage), que só existe no
  // cliente: a tela é montada depois da hidratação para ler o valor salvo.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (!hydrated) return <p className="text-sm text-ink-muted">Carregando…</p>;
  return <LeadsRoiView data={data} saved={readSaved()} />;
}

function LeadsRoiView({ data, saved }: { data: LeadsRoiData; saved: SavedState }) {
  const [leadsStart, leadsEnd] = data.sources.leadsRange;
  const dataEnd = [leadsEnd, data.sources.paidRange[1]].sort().at(-1) ?? "";

  const [from, setFrom] = useState(leadsStart);
  const [to, setTo] = useState("");
  const [globalCpl, setGlobalCpl] = useState(saved.globalCpl);
  const [overrides, setOverrides] = useState<Record<string, string>>(saved.overrides);
  const [costMode, setCostMode] = useState<CostMode>(saved.costMode);
  const [discountInad, setDiscountInad] = useState(saved.discountInad);
  const [unitCost, setUnitCost] = useState(saved.unitCost);
  const unitCostValue = parseMoney(unitCost) ?? 0;
  const [search, setSearch] = useState("");
  const [minLeads, setMinLeads] = useState("0");
  const [minSpend, setMinSpend] = useState("0");
  const [view, setView] = useState<ViewMode>("ad");
  const isCamp = view === "camp";
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ globalCpl, overrides, costMode, discountInad, unitCost }));
    } catch {
      // armazenamento indisponível: segue sem persistência
    }
  }, [globalCpl, overrides, costMode, discountInad, unitCost]);

  const hasCampSpend = data.sources.campaignSpendTotal > 0;
  const { campCovered, campTotal } = useMemo(() => {
    const leadsByCamp = data.campaigns.map(() => 0);
    for (const [, c, day, leads] of data.rows) if (day !== "" && day >= leadsStart) leadsByCamp[c] += leads;
    let covered = 0;
    let total = 0;
    data.campaigns.forEach((camp, i) => {
      if (camp.key === "") return;
      total += leadsByCamp[i];
      if (camp.spend) covered += leadsByCamp[i];
    });
    return { campCovered: covered, campTotal: total };
  }, [data, leadsStart]);
  const globalCplValue = parseMoney(globalCpl);
  // O gasto da planilha cobre a base de leads inteira. Se o período for menor,
  // o gasto e as métricas do Meta são rateados pela fração de leads do período.
  const coversWholeBase = (!from || from <= leadsStart) && (!to || to >= leadsEnd);

  const rows = useMemo<Row[]>(() => {
    const isAd = view === "ad";
    const nC = data.campaigns.length;
    const c0 = data.campaigns.findIndex((c) => c.key === "");
    interface Pair {
      a: number;
      c: number;
      leads: number;
      sales: number;
      revenue: number;
      inad: number;
      inadValue: number;
      dated: number;
    }
    const datedAll = data.ads.map(() => 0);
    const cDatedAll = data.campaigns.map(() => 0);
    const cDated = data.campaigns.map(() => 0);
    const pairs = new Map<number, Pair>();
    const pairOf = (a: number, c: number) => {
      const k = a * nC + c;
      let p = pairs.get(k);
      if (!p) {
        p = { a, c, leads: 0, sales: 0, revenue: 0, inad: 0, inadValue: 0, dated: 0 };
        pairs.set(k, p);
      }
      return p;
    };
    const includeUndated = !from && !to;
    for (const [a, c, day, leads, sales, revenue, inad, inadValue] of data.rows) {
      if (day !== "") {
        datedAll[a] += leads;
        cDatedAll[c] += leads;
      }
      if (day === "") {
        if (!includeUndated) continue;
      } else if ((from && day < from) || (to && day > to)) continue;
      const p = pairOf(a, c);
      if (day !== "") {
        p.dated += leads;
        cDated[c] += leads;
      }
      p.leads += leads;
      p.sales += sales;
      p.revenue += revenue;
      p.inad += inad;
      p.inadValue += inadValue;
    }
    // Criativo com gasto e sem nenhum lead datado: o gasto cai em "(sem campanha identificada)".
    if (isAd)
      data.ads.forEach((ad, a) => {
        if (ad.spend && datedAll[a] === 0) pairOf(a, c0);
      });

    // O gasto da planilha é por criativo: cada par (anúncio, campanha) recebe a fração do gasto
    // igual à fração dos leads datados do anúncio que caem nele e no período.
    interface Group {
      leads: number;
      sales: number;
      revenue: number;
      inad: number;
      inadValue: number;
      meta: boolean;
      spend: number;
      impr: number;
      clicks: number;
      conv: number;
      members: Map<number, number>;
    }
    const groups = new Map<number, Group>();
    const newGroup = (): Group => ({ leads: 0, sales: 0, revenue: 0, inad: 0, inadValue: 0, meta: false, spend: 0, impr: 0, clicks: 0, conv: 0, members: new Map() });
    for (const p of pairs.values()) {
      const meta = data.ads[p.a].spend;
      let f = 0;
      if (meta) {
        if (datedAll[p.a] > 0) f = Math.min(1, p.dated / datedAll[p.a]);
        else if (p.c === c0 && coversWholeBase) f = 1;
      }
      const gk = isAd ? p.a : p.c;
      let g = groups.get(gk);
      if (!g) {
        g = newGroup();
        groups.set(gk, g);
      }
      g.leads += p.leads;
      g.sales += p.sales;
      g.revenue += p.revenue;
      g.inad += p.inad;
      g.inadValue += p.inadValue;
      if (meta && isAd) {
        g.meta = true;
        g.spend += meta.spend * f;
        g.impr += meta.impressions * f;
        g.clicks += meta.linkClicks * f;
        g.conv += meta.conversations * f;
      }
      const mk = isAd ? p.c : p.a;
      g.members.set(mk, (g.members.get(mk) ?? 0) + p.leads + p.sales);
    }

    // Visão por campanha: custo real de cada campanha (planilha "Custo campanhas"), na fração de leads do período.
    if (!isAd) {
      data.campaigns.forEach((camp, c) => {
        const meta = camp.spend;
        if (!meta) return;
        const f = cDatedAll[c] > 0 ? Math.min(1, cDated[c] / cDatedAll[c]) : coversWholeBase ? 1 : 0;
        let g = groups.get(c);
        if (!g) {
          g = newGroup();
          groups.set(c, g);
        }
        g.meta = true;
        g.spend += meta.spend * f;
        g.impr += meta.impressions * f;
        g.clicks += meta.linkClicks * f;
        g.conv += meta.conversations * f;
      });
    }

    const out: Row[] = [];
    for (const [gk, g] of groups) {
      const spend = g.meta ? g.spend : null;
      if (g.leads === 0 && g.sales === 0 && g.inad === 0 && !(spend && spend > 0)) continue;
      const ad = isAd ? data.ads[gk] : null;
      const camp = isAd ? null : data.campaigns[gk];
      const id = ad ? ad.key : `c:${camp!.key}`;
      const override = parseMoney(overrides[id] ?? "");
      const productCost = (g.sales + g.inad) * unitCostValue; // pedidos enviados: pagos + inadimplentes
      let cost: number | null;
      if (override !== null) cost = g.leads * override;
      else if (costMode === "real" && spend !== null) cost = spend;
      else cost = globalCplValue === null ? null : g.leads * globalCplValue;

      const members = [...g.members].sort((x, y) => y[1] - x[1]).map(([m]) => m);
      let name: string;
      const sub: string[] = [];
      let search: string;
      if (ad) {
        name = ad.name;
        // variações de nome somadas, ignorando as que só diferem por maiúscula/minúscula
        const merged = ad.variants.filter((v) => v.trim().toLowerCase() !== ad.name.toLowerCase());
        if (merged.length) sub.push(`inclui ${merged.join(", ")}`);
        const nCamp = members.filter((m) => m !== c0).length;
        if (nCamp > 0) sub.push(`${nCamp} campanha${nCamp > 1 ? "s" : ""}`);
        search = `${name} ${members.map((m) => data.campaigns[m].name).join(" ")}`;
      } else {
        name = camp!.name;
        const names = members.filter((m) => data.ads[m].key !== "").map((m) => data.ads[m].name);
        if (names.length) sub.push(`${names.length} anúncio${names.length > 1 ? "s" : ""}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}`);
        search = `${name} ${names.join(" ")}`;
      }

      out.push({
        id,
        name,
        sub: sub.join(" · "),
        search: search.toLowerCase(),
        isUnknown: ad ? ad.key === "" : camp!.key === "",
        spend,
        impressions: g.meta ? g.impr : null,
        clicks: g.clicks,
        cpm: g.meta ? div(g.spend, g.impr / 1000) : null,
        ctr: g.meta ? div(g.clicks * 100, g.impr) : null,
        conversations: g.meta ? g.conv : null,
        costPerConv: g.meta ? div(g.spend, g.conv) : null,
        leads: g.leads,
        cpl: cost !== null ? div(cost, g.leads) : null,
        customCpl: override !== null,
        sales: g.sales,
        conversion: g.leads > 0 ? (g.sales / g.leads) * 100 : null,
        cost,
        cpa: cost !== null ? div(cost, g.sales) : null,
        inad: g.inad,
        inadRate: div(g.inad * 100, g.sales + g.inad),
        inadValue: g.inadValue,
        revenue: g.revenue,
        productCost,
        roas: cost !== null ? div(g.revenue, cost) : null,
        profit: cost === null ? null : g.revenue - cost - productCost - (discountInad ? g.inadValue : 0),
        roi: cost !== null && cost > 0 ? ((g.revenue - cost - productCost - (discountInad ? g.inadValue : 0)) / cost) * 100 : null,
      });
    }
    return out;
  }, [data, view, from, to, overrides, globalCplValue, costMode, coversWholeBase, discountInad, unitCostValue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = Number(minLeads) || 0;
    const minSp = parseMoney(minSpend) ?? 0;
    const result = rows.filter((r) => r.leads >= min && (r.spend ?? 0) >= minSp && (!q || r.search.includes(q)));
    const dir = sortDir === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "pt-BR", { numeric: true }) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [rows, search, minLeads, minSpend, sortKey, sortDir]);

  const totals = useMemo<Totals>(() => {
    let spend = 0, impressions = 0, conversations = 0, linkClicks = 0;
    let leads = 0, sales = 0, revenue = 0, inad = 0, inadValue = 0;
    let cost = 0, costedLeads = 0, costedSales = 0, uncosted = 0;
    for (const r of filtered) {
      leads += r.leads;
      sales += r.sales;
      revenue += r.revenue;
      inad += r.inad;
      inadValue += r.inadValue;
      if (r.spend !== null) {
        spend += r.spend;
        impressions += r.impressions ?? 0;
        conversations += r.conversations ?? 0;
        linkClicks += r.clicks;
      }
      if (r.cost !== null) {
        cost += r.cost;
        costedLeads += r.leads;
        costedSales += r.sales;
      } else if (r.leads > 0 || r.sales > 0) uncosted++;
    }
    return {
      spend,
      impressions,
      cpm: div(spend, impressions / 1000),
      ctr: div(linkClicks * 100, impressions),
      conversations,
      costPerConv: div(spend, conversations),
      leads,
      cpl: div(cost, costedLeads),
      sales,
      conversion: div(sales * 100, leads),
      cost,
      cpa: div(cost, costedSales),
      inad,
      inadRate: div(inad * 100, sales + inad),
      inadValue,
      revenue,
      productCost: (sales + inad) * unitCostValue,
      // Lucro e ROI totais usam toda a receita e todas as perdas, inclusive de quem não tem custo de anúncio conhecido.
      roas: div(revenue, cost),
      profit: revenue - cost - (sales + inad) * unitCostValue - (discountInad ? inadValue : 0),
      roi: cost > 0 ? ((revenue - cost - (sales + inad) * unitCostValue - (discountInad ? inadValue : 0)) / cost) * 100 : null,
      uncosted,
    };
  }, [filtered, discountInad, unitCostValue]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function setOverride(key: string, value: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  const overrideCount = Object.keys(overrides).length;
  const presets = [
    { label: "Base de leads", from: leadsStart, to: "" },
    { label: "Últimos 30 dias", from: shiftDay(dataEnd, -29), to: "" },
    { label: "Últimos 7 dias", from: shiftDay(dataEnd, -6), to: "" },
    { label: "Todo o período", from: "", to: "" },
  ];

  const money = (v: number | null) => (v === null ? "—" : formatMoney(v));
  const num = (v: number | null) => (v === null ? "—" : formatNumber(v));
  const roiText = (v: number | null) => (v === null ? "—" : formatPercent(v, 0));

  interface Col {
    key: NumericKey;
    label: string;
    cell: (r: Row) => ReactNode;
    foot: (t: Totals) => ReactNode;
    cellClass?: (r: Row) => string;
    footClass?: (t: Totals) => string;
  }
  const groups: { label: string; cols: Col[] }[] = [
    {
      label: "Meta",
      cols: [
        { key: "spend", label: "Gasto", cell: (r) => money(r.spend), foot: (t) => money(t.spend) },
        { key: "impressions", label: "Impressões", cell: (r) => num(r.impressions), foot: (t) => num(t.impressions) },
        { key: "cpm", label: "CPM", cell: (r) => money(r.cpm), foot: (t) => money(t.cpm) },
        { key: "ctr", label: "CTR link", cell: (r) => (r.ctr === null ? "—" : formatPercent(r.ctr)), foot: (t) => (t.ctr === null ? "—" : formatPercent(t.ctr)) },
        { key: "conversations", label: "Conversas", cell: (r) => num(r.conversations), foot: (t) => num(t.conversations) },
        { key: "costPerConv", label: "Custo/conversa", cell: (r) => money(r.costPerConv), foot: (t) => money(t.costPerConv) },
      ],
    },
    {
      label: "Funil",
      cols: [
        { key: "leads", label: "Leads", cell: (r) => formatNumber(r.leads), foot: (t) => formatNumber(t.leads) },
        { key: "cpl", label: "CPL", cell: (r) => money(r.cpl), foot: (t) => money(t.cpl) },
        { key: "sales", label: "Vendas", cell: (r) => formatNumber(r.sales), foot: (t) => formatNumber(t.sales) },
        {
          key: "conversion",
          label: "Conversão",
          cell: (r) =>
            r.sales > r.leads ? (
              <span
                className="inline-flex items-center gap-1 text-status-serious"
                title="Há mais vendas do que leads neste período: parte das vendas veio de leads que não estão na planilha de leads."
              >
                <AlertTriangle size={12} />
                {formatPercent(r.conversion)}
              </span>
            ) : r.conversion === null ? (
              "—"
            ) : (
              formatPercent(r.conversion)
            ),
          foot: (t) => (t.conversion === null ? "—" : formatPercent(t.conversion)),
        },
        { key: "cpa", label: "Custo/venda", cell: (r) => money(r.cpa), foot: (t) => money(t.cpa) },
      ],
    },
    {
      label: "Inadimplência",
      cols: [
        { key: "inad", label: "Inadimplentes", cell: (r) => formatNumber(r.inad), foot: (t) => formatNumber(t.inad) },
        {
          key: "inadRate",
          label: "% inadimpl.",
          cell: (r) => (r.inadRate === null ? "—" : formatPercent(r.inadRate, 1)),
          foot: (t) => (t.inadRate === null ? "—" : formatPercent(t.inadRate, 1)),
          cellClass: (r) => (r.inadRate !== null && r.inadRate >= 20 ? "text-status-serious" : ""),
        },
        { key: "inadValue", label: "Valor em aberto", cell: (r) => money(r.inadValue), foot: (t) => money(t.inadValue) },
      ],
    },
    {
      label: "Resultado",
      cols: [
        { key: "revenue", label: "Receita", cell: (r) => money(r.revenue), foot: (t) => money(t.revenue) },
        { key: "productCost", label: "Custo operacional", cell: (r) => money(r.productCost), foot: (t) => money(t.productCost) },
        { key: "roas", label: "ROAS", cell: (r) => (r.roas === null ? "—" : formatRoas(r.roas)), foot: (t) => (t.roas === null ? "—" : formatRoas(t.roas)) },
        {
          key: "profit",
          label: "Lucro",
          cell: (r) => money(r.profit),
          foot: (t) => money(t.cost > 0 ? t.profit : null),
          cellClass: (r) => roiClass(r.profit),
          footClass: (t) => roiClass(t.cost > 0 ? t.profit : null),
        },
        {
          key: "roi",
          label: "ROI",
          cell: (r) => roiText(r.roi),
          foot: (t) => roiText(t.roi),
          cellClass: (r) => `font-semibold ${roiClass(r.roi)}`,
          footClass: (t) => roiClass(t.roi),
        },
      ],
    },
  ];
  const allCols = groups.flatMap((g) => g.cols);
  const hasSpend = data.sources.spendTotal > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Métricas por anúncio: investimento, leads, vendas e ROI</h1>
        <p className="text-sm text-ink-muted">
          {formatNumber(data.sources.leadsRows)} leads, {formatNumber(data.sources.salesCount)} vendas e {formatMoney(data.sources.spendTotal)} investidos, cruzados pelo nome do
          anúncio · {data.ads.filter((ad) => ad.key !== "").length} anúncios.
        </p>
      </div>

      {/* Controles: custo + período */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,3fr)]">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Custo usado no ROI</h2>
          <div className="mt-3 inline-flex rounded-lg border border-border bg-page p-0.5 text-xs">
            {(
              [
                ["real", "Gasto real (planilha)"],
                ["manual", "CPL manual"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setCostMode(mode)}
                disabled={mode === "real" && !hasSpend}
                className={`rounded-md px-3 py-1.5 ${costMode === mode ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-secondary hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-page px-3 py-2 focus-within:border-series-1">
              <span className="text-sm text-ink-muted">R$</span>
              <input
                value={globalCpl}
                onChange={(e) => setGlobalCpl(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="CPL padrão"
                className="w-24 bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-ink-muted"
              />
            </label>
            <span className="max-w-xs text-xs text-ink-muted">
              {costMode === "real"
                ? "CPL padrão, usado só nos anúncios que não estão na planilha de gasto."
                : "por lead, aplicado a todos os anúncios (ignora o gasto da planilha)."}
            </span>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-secondary">
            <span className="font-medium text-ink">Custo operacional por pedido enviado</span>
            <span className="flex items-center gap-1 rounded-lg border border-border bg-page px-2 py-1 focus-within:border-series-1">
              <span className="text-ink-muted">R$</span>
              <input
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Custo operacional por pedido enviado"
                className="w-16 bg-transparent text-sm font-semibold text-ink outline-none"
              />
            </span>
            <span className="text-ink-muted">produto, frete e demais custos, também nos inadimplentes</span>
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={discountInad} onChange={(e) => setDiscountInad(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium text-ink">Descontar a inadimplência do lucro e do ROI</span>
              <span className="block text-ink-muted">Lucro = receita − custo − valor em aberto dos pedidos inadimplentes.</span>
            </span>
          </label>
          <p className="mt-3 text-xs text-ink-muted">
            Para um item específico, digite um CPL na coluna &quot;CPL manual&quot; da tabela.
            {overrideCount > 0 && (
              <>
                {" "}
                <button onClick={() => setOverrides({})} className="text-series-1 hover:underline">
                  Limpar {overrideCount} CPL individual(is)
                </button>
              </>
            )}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Período (data de entrada do lead)</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              min={leadsStart}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Data inicial"
              className="rounded-lg border border-border bg-page px-2 py-1.5 text-sm text-ink"
            />
            <span className="text-xs text-ink-muted">até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Data final"
              className="rounded-lg border border-border bg-page px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {presets.map((p) => {
              const active = from === p.from && to === p.to;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                  className={`rounded-full border px-2.5 py-1 ${active ? "border-series-1 bg-series-1/10 text-series-1" : "border-border bg-page text-ink-secondary hover:text-ink"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {!from && !to && (
        <Notice>
          A planilha de leads só cobre {formatDate(leadsStart)} a {formatDate(leadsEnd)}, mas a de pagantes tem vendas desde {formatDate(data.sources.paidRange[0])}. Em &quot;Todo o
          período&quot;, as vendas de leads anteriores a {formatDate(leadsStart)} entram sem os leads correspondentes e a conversão fica inflada. Para uma conversão comparável, use
          &quot;Base de leads&quot;.
        </Notice>
      )}
      {hasSpend && !coversWholeBase && (
        <Notice>
          A planilha de gasto não tem datas. Com o período reduzido, gasto, impressões e conversas são <strong>estimados</strong>, rateados pela fração de leads de cada anúncio que cai no
          período.
        </Notice>
      )}

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Gasto (Meta)" value={hasSpend ? formatMoney(totals.spend) : "—"} />
        <Stat label="Leads" value={formatNumber(totals.leads)} />
        <Stat label="CPL" value={money(totals.cpl)} muted={totals.cpl === null} />
        <Stat label="Vendas" value={formatNumber(totals.sales)} />
        <Stat label="Conversão" value={totals.conversion === null ? "—" : formatPercent(totals.conversion)} />
        <Stat label="Custo por venda" value={money(totals.cpa)} muted={totals.cpa === null} />
        <Stat label="Inadimplentes" value={formatNumber(totals.inad)} />
        <Stat label="% inadimplência" value={totals.inadRate === null ? "—" : formatPercent(totals.inadRate, 1)} />
        <Stat label="Receita" value={formatMoney(totals.revenue)} />
        <Stat label="ROAS" value={totals.roas === null ? "—" : formatRoas(totals.roas)} valueClass={roiClass(totals.roas === null ? null : totals.roas - 1)} />
        <Stat label="Lucro" value={totals.cost > 0 ? formatMoney(totals.profit) : "—"} valueClass={roiClass(totals.cost > 0 ? totals.profit : null)} />
        <Stat label="ROI" value={roiText(totals.roi)} valueClass={roiClass(totals.roi)} />
      </div>
      {totals.uncosted > 0 && (
        <p className="-mt-3 text-xs text-ink-muted">
          {totals.uncosted} item(ns) sem custo de anúncio conhecido (não estão na planilha de gasto{costMode === "real" ? " e não há CPL padrão" : ""}): a receita e as perdas deles entram no lucro e no ROI totais, mas sem custo de anúncio.
        </p>
      )}

      {isCamp && hasCampSpend && (
        <Notice>
          O gasto de cada campanha é o <strong>valor real do Meta</strong> (planilha &quot;Custo campanhas&quot;). {formatPercent((campCovered / campTotal) * 100, 0)} dos leads estão em campanhas
          com custo. Os outros {formatNumber(campTotal - campCovered)} leads estão em campanhas que aparecem com outro nome no CRM: ficam sem custo na tabela, e o gasto delas está somado em
          outras linhas.
        </Notice>
      )}

      {/* Visão e filtros da tabela */}
      <div className="inline-flex rounded-lg border border-border bg-page p-0.5 text-xs" role="group" aria-label="Agrupar por">
        {(
          [
            ["ad", "Por anúncio"],
            ["camp", "Por campanha"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            aria-pressed={view === mode}
            className={`rounded-md px-3 py-1.5 ${view === mode ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-secondary hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={14} className="text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isCamp ? "Pesquisar campanha ou anúncio..." : "Pesquisar anúncio ou campanha..."}
            className="w-64 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Limpar pesquisa" className="text-ink-muted hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Mínimo de leads
          <input
            value={minLeads}
            onChange={(e) => setMinLeads(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Gasto mínimo
          <span className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-series-1">
            <span className="text-ink-muted">R$</span>
            <input
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
              inputMode="decimal"
              aria-label={isCamp ? "Gasto mínimo por campanha" : "Gasto mínimo por anúncio"}
              className="w-20 bg-transparent text-sm text-ink outline-none"
            />
          </span>
        </label>
        <span className="text-xs text-ink-muted">
          {filtered.length} {isCamp ? "campanha(s)" : "anúncio(s)"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[2000px] text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 z-[1] bg-surface" />
              {groups.map((g, i) => (
                <th key={g.label} colSpan={g.cols.length} className={`px-3 pt-2 text-center ${i > 0 ? "border-l border-border" : ""}`}>
                  {g.label}
                </th>
              ))}
              <th className="border-l border-border" />
            </tr>
            <tr className="border-b border-border text-xs text-ink-muted">
              <th className="sticky left-0 z-[1] bg-surface px-3 py-2.5 text-left font-medium">
                <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-ink">
                  {isCamp ? "Campanha" : "Anúncio"}
                  {sortKey === "name" && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </th>
              {groups.map((g, gi) =>
                g.cols.map((col, ci) => (
                  <th key={col.key} className={`px-3 py-2.5 text-right font-medium ${gi > 0 && ci === 0 ? "border-l border-border" : ""}`}>
                    <button onClick={() => toggleSort(col.key)} className="inline-flex flex-row-reverse items-center gap-1 whitespace-nowrap hover:text-ink">
                      {col.label}
                      {sortKey === col.key && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                )),
              )}
              <th className="border-l border-border px-3 py-2.5 text-right font-medium whitespace-nowrap">CPL manual</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="group border-b border-border last:border-0 hover:bg-page">
                <td className="sticky left-0 z-[1] bg-surface px-3 py-2.5 group-hover:bg-page">
                  <div className={`max-w-[220px] truncate font-medium ${r.isUnknown ? "italic text-ink-muted" : "text-ink"}`} title={r.name}>
                    {r.name}
                  </div>
                  {r.sub && (
                    <div className="max-w-[220px] truncate text-xs text-ink-muted" title={r.sub}>
                      {r.sub}
                    </div>
                  )}
                </td>
                {groups.map((g, gi) =>
                  g.cols.map((col, ci) => (
                    <td key={col.key} className={`px-3 py-2.5 text-right tabular whitespace-nowrap ${gi > 0 && ci === 0 ? "border-l border-border" : ""} ${col.cellClass?.(r) ?? ""}`}>
                      {col.cell(r)}
                    </td>
                  )),
                )}
                <td className="border-l border-border px-3 py-2 text-right">
                  <input
                    value={overrides[r.id] ?? ""}
                    onChange={(e) => setOverride(r.id, e.target.value)}
                    inputMode="decimal"
                    placeholder={r.leads > 0 && r.cpl !== null ? formatNumber(r.cpl, 2) : "—"}
                    aria-label={`CPL manual de ${r.name}`}
                    className={`w-20 rounded-md border bg-page px-2 py-1 text-right text-sm tabular outline-none focus:border-series-1 ${r.customCpl ? "border-series-1 text-ink" : "border-border text-ink-secondary"}`}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={allCols.length + 2} className="px-3 py-8 text-center text-sm text-ink-muted">
                  Nada encontrado para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-page font-semibold text-ink">
                <td className="sticky left-0 z-[1] bg-page px-3 py-2.5">Total ({filtered.length})</td>
                {groups.map((g, gi) =>
                  g.cols.map((col, ci) => (
                    <td key={col.key} className={`px-3 py-2.5 text-right tabular whitespace-nowrap ${gi > 0 && ci === 0 ? "border-l border-border" : ""} ${col.footClass?.(totals) ?? ""}`}>
                      {col.foot(totals)}
                    </td>
                  )),
                )}
                <td className="border-l border-border" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="space-y-1 text-xs text-ink-muted">
        <p>
          <strong className="font-medium text-ink-secondary">Gasto, impressões, CPM, CTR e conversas</strong> vêm da planilha do Meta (CTR = cliques no link ÷ impressões).{" "}
          <strong className="font-medium text-ink-secondary">Leads, vendas e receita</strong> vêm das planilhas de leads e pagantes; receita = soma da coluna &quot;Valor&quot; (
          {formatNumber(data.sources.salesWithoutValue)} vendas sem valor entram só na contagem).
        </p>
        <p>
          <strong className="font-medium text-ink-secondary">Inadimplentes</strong> vêm das planilhas &quot;inadimplente 1&quot; e &quot;inadimplente 2&quot; ({formatNumber(data.sources.inadCount)} pedidos,{" "}
          {formatMoney(data.sources.inadValueTotal)} em aberto): cada pedido é ligado pelo telefone ao lead e vai para o anúncio dele. {formatNumber(data.sources.inadMatchedLead + data.sources.inadMatchedPaid)}{" "}
          foram ligados a um anúncio; {formatNumber(data.sources.inadUnattributed)} não têm lead correspondente e ficam em &quot;(sem anúncio identificado)&quot;. Inadimplentes não entram em Vendas
          nem em Receita{discountInad ? ", mas o valor em aberto é descontado do Lucro e do ROI" : ""}; % inadimplência = inadimplentes ÷ (vendas + inadimplentes).
        </p>
        <p>
          CPL = custo ÷ leads · Custo/venda = custo ÷ vendas · ROAS = receita ÷ custo · Custo operacional = {formatMoney(unitCostValue)} × (vendas + inadimplentes) · Lucro = receita − custo − custo operacional{discountInad ? " − valor em aberto dos inadimplentes" : ""} · ROI = lucro ÷ custo. Anúncios são agrupados pelo nome (sem diferenciar maiúsculas; nomes
          repetidos em campanhas diferentes são somados). Dados gerados em {new Date(data.generatedAt).toLocaleString("pt-BR")}.
        </p>
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-status-warning/50 bg-status-warning/10 p-3 text-xs text-ink-secondary">
      <Info size={14} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function Stat({ label, value, muted, valueClass }: { label: string; value: string; muted?: boolean; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular ${valueClass ?? (muted ? "text-ink-muted" : "text-ink")}`}>{value}</div>
    </div>
  );
}
