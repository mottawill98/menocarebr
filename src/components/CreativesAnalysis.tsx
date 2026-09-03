"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { PeriodSelector } from "./PeriodSelector";
import { getCategory } from "@/lib/conversion-helpers";
import { formatMoney, formatPercent, formatNumber, formatRoas, formatStatus } from "@/lib/format";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_LABELS } from "@/lib/periods";
import { analyzeCreative, computeAdBaseline, CLASSIFICATION_EMOJI, CLASSIFICATION_LABEL, type CreativeClassification } from "@/lib/analysis/creatives";
import type { ProcessedAd, ProcessedCampaign, ProcessedAdSet } from "@/lib/analysis/process";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "cpm" | "frequency" | "count" | "cpa" | "roas" | "revenue";

const CLASSIFICATIONS: CreativeClassification[] = ["vencedor", "bom", "observar", "ruim", "fadiga"];

const BADGE_CLASS: Record<CreativeClassification, string> = {
  vencedor: "bg-status-good/10 text-status-good",
  bom: "bg-series-1/10 text-series-1",
  observar: "bg-status-warning/15 text-ink-secondary",
  ruim: "bg-status-critical/10 text-status-critical",
  fadiga: "bg-status-serious/10 text-status-serious",
};

function ClassificationBadge({ c }: { c: CreativeClassification }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_CLASS[c]}`}>
      {CLASSIFICATION_EMOJI[c]} {CLASSIFICATION_LABEL[c]}
    </span>
  );
}

export function CreativesAnalysis({
  ads,
  campaigns,
  adsets,
  currency,
}: {
  ads: ProcessedAd[];
  campaigns: ProcessedCampaign[];
  adsets: ProcessedAdSet[];
  currency: string;
}) {
  const [period] = usePeriod();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const campaignNameById = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const adsetNameById = useMemo(() => new Map(adsets.map((a) => [a.id, a.name])), [adsets]);

  const rows = useMemo(() => {
    const adsWithSpend = ads.map((a) => a.windows[period]).filter((m) => m.spend > 0);
    const baseline = computeAdBaseline(adsWithSpend);

    return ads.map((a) => {
      const metrics = a.windows[period];
      const insight = analyzeCreative(metrics, baseline);
      const purchase = getCategory(metrics, "purchase");
      return {
        ad: a,
        metrics,
        insight,
        campaignName: campaignNameById.get(a.campaignId) ?? a.campaignId,
        adsetName: adsetNameById.get(a.adsetId) ?? a.adsetId,
        spend: metrics.spend,
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
        cpm: metrics.cpm,
        frequency: metrics.frequency,
        count: insight.primaryLabel ? purchase?.count ?? null : null,
        cpa: insight.cpa,
        roas: metrics.purchaseRoas,
        revenue: purchase?.value ?? null,
      };
    });
  }, [ads, period, campaignNameById, adsetNameById]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.insight.classification] = (c[r.insight.classification] ?? 0) + 1;
    return c;
  }, [rows]);

  const highlights = useMemo(() => {
    const withSpend = rows.filter((r) => r.spend > 0);
    const best = withSpend
      .filter((r) => r.insight.classification === "vencedor")
      .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity))
      .slice(0, 5);
    const worst = withSpend
      .filter((r) => r.insight.classification === "ruim")
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
    const fatigue = withSpend.filter((r) => r.insight.classification === "fadiga").sort((a, b) => b.spend - a.spend).slice(0, 5);
    const patterns = withSpend.filter((r) => r.insight.tags.length > 0 && r.insight.classification !== "ruim" && r.insight.classification !== "fadiga").slice(0, 8);
    return { best, worst, fatigue, patterns };
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.ad.name.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q));
    }
    if (classFilter !== "ALL") {
      result = result.filter((r) => r.insight.classification === classFilter);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...result].sort((a, b) => {
      const av = sortKey === "name" ? a.ad.name : a[sortKey];
      const bv = sortKey === "name" ? b.ad.name : b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, search, classFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Criativo" },
    { key: "spend", label: "Gasto" },
    { key: "impressions", label: "Impressões" },
    { key: "ctr", label: "CTR" },
    { key: "cpc", label: "CPC" },
    { key: "cpm", label: "CPM" },
    { key: "frequency", label: "Frequência" },
    { key: "count", label: "Conversões" },
    { key: "cpa", label: "CPA" },
    { key: "roas", label: "ROAS" },
    { key: "revenue", label: "Valor conversão" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Análise de criativos — {PERIOD_LABELS[period]}</h1>
          <p className="text-sm text-ink-muted">{ads.length} anúncios analisados nesta conta.</p>
        </div>
        <PeriodSelector />
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-ink-secondary">
        {CLASSIFICATIONS.map((c) => (
          <button
            key={c}
            onClick={() => setClassFilter(classFilter === c ? "ALL" : c)}
            className={`rounded-full border px-2.5 py-1 ${classFilter === c ? "border-series-1 bg-series-1/10 text-series-1" : "border-border bg-surface"}`}
          >
            {CLASSIFICATION_EMOJI[c]} {CLASSIFICATION_LABEL[c]}: {counts[c] ?? 0}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HighlightList title="🔥 Melhores criativos" items={highlights.best} currency={currency} />
        <HighlightList title="🔴 Piores criativos" items={highlights.worst} currency={currency} />
        <HighlightList title="⚠️ Possível fadiga" items={highlights.fatigue} currency={currency} />
      </div>

      {highlights.patterns.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Padrões identificados</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {highlights.patterns.map((r) => (
              <div key={r.ad.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <div className="font-medium text-ink">{r.ad.name}</div>
                <div className="mt-1 text-xs text-ink-secondary">{r.insight.tags.join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={14} className="text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar anúncio ou campanha..."
            className="w-64 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <span className="text-xs text-ink-muted">{filtered.length} anúncio(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2.5 font-medium">
                  <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-ink">
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium">Campanha / Conjunto</th>
              <th className="px-3 py-2.5 font-medium">Classificação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ad.id} className="border-b border-border align-top last:border-0 hover:bg-page">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {r.ad.creative?.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.ad.creative.thumbnail_url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded bg-page" />
                    )}
                    <Link href={`/campaigns/${r.ad.campaignId}`} className="max-w-[220px] truncate font-medium text-ink hover:underline">
                      {r.ad.name}
                    </Link>
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">{formatStatus(r.ad.effectiveStatus)}</div>
                </td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.spend, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatNumber(r.impressions)}</td>
                <td className="px-3 py-2.5 tabular">{formatPercent(r.ctr)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpc, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpm, currency)}</td>
                <td className="px-3 py-2.5 tabular">{r.frequency !== null ? formatNumber(r.frequency, 2) : "N/A"}</td>
                <td className="px-3 py-2.5 tabular">{r.count !== null ? formatNumber(r.count) : "N/A"}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpa, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatRoas(r.roas)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.revenue, currency)}</td>
                <td className="max-w-[200px] px-3 py-2.5 text-xs text-ink-secondary">
                  <div className="truncate">{r.campaignName}</div>
                  <div className="truncate text-ink-muted">{r.adsetName}</div>
                </td>
                <td className="px-3 py-2.5">
                  <ClassificationBadge c={r.insight.classification} />
                  <div className="mt-1 max-w-[220px] text-xs text-ink-muted">{r.insight.reason}</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-ink-muted">
                  Nenhum anúncio encontrado para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HighlightList({
  title,
  items,
  currency,
}: {
  title: string;
  items: { ad: ProcessedAd; cpa: number | null; spend: number; insight: { reason: string } }[];
  currency: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-ink-muted">Nenhum criativo nesta categoria no momento.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.ad.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/campaigns/${item.ad.campaignId}`} className="truncate text-sm font-medium text-ink hover:underline">
                  {item.ad.name}
                </Link>
                <span className="shrink-0 text-xs font-medium text-ink-secondary tabular">{formatMoney(item.spend, currency)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{item.insight.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
