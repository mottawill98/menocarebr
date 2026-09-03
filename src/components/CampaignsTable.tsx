"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { PeriodSelector } from "./PeriodSelector";
import { RecommendationBadge } from "./RecommendationBadge";
import { formatMoney, formatPercent, formatNumber, formatRoas, formatStatus } from "@/lib/format";
import { pickPrimaryCategory } from "@/lib/analysis/recommendation";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_LABELS } from "@/lib/periods";
import type { ProcessedCampaign } from "@/lib/analysis/process";

type SortKey = "name" | "spend" | "result" | "cpa" | "cpc" | "ctr" | "cpm" | "frequency" | "roas";

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-status-good",
  PAUSED: "bg-ink-muted",
};

export function CampaignsTable({ campaigns, currency }: { campaigns: ProcessedCampaign[]; currency: string }) {
  const [period] = usePeriod();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const statuses = useMemo(() => Array.from(new Set(campaigns.map((c) => c.effectiveStatus))), [campaigns]);

  const rows = useMemo(() => {
    return campaigns.map((c) => {
      const metrics = c.windows[period];
      const primary = pickPrimaryCategory(metrics);
      return {
        campaign: c,
        metrics,
        primary,
        spend: metrics.spend,
        result: primary?.count ?? null,
        resultLabel: primary?.label ?? null,
        cpa: primary?.costPer ?? null,
        cpc: metrics.cpc,
        ctr: metrics.ctr,
        cpm: metrics.cpm,
        frequency: metrics.frequency,
        roas: metrics.purchaseRoas,
      };
    });
  }, [campaigns, period]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.campaign.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.campaign.effectiveStatus === statusFilter);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...result].sort((a, b) => {
      const av = sortKey === "name" ? a.campaign.name : a[sortKey];
      const bv = sortKey === "name" ? b.campaign.name : b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Campanha" },
    { key: "spend", label: "Investimento" },
    { key: "result", label: "Resultado" },
    { key: "cpa", label: "CPA" },
    { key: "cpc", label: "CPC" },
    { key: "ctr", label: "CTR" },
    { key: "cpm", label: "CPM" },
    { key: "frequency", label: "Frequência" },
    { key: "roas", label: "ROAS" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Campanhas — {PERIOD_LABELS[period]}</h1>
        <PeriodSelector />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={14} className="text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar campanha..."
            className="w-56 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="ALL">Todos os status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {formatStatus(s)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">{filtered.length} campanha(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2.5 font-medium">
                  <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-ink">
                    {col.label}
                    {sortKey === col.key &&
                      (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium">Recomendação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.campaign.id} className="border-b border-border last:border-0 hover:bg-page">
                <td className="px-3 py-2.5">
                  <Link href={`/campaigns/${r.campaign.id}`} className="flex items-center gap-2 font-medium text-ink hover:underline">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.campaign.effectiveStatus] ?? "bg-ink-muted"}`} />
                    <span className="max-w-[280px] truncate">{r.campaign.name}</span>
                  </Link>
                  <div className="ml-4 text-xs text-ink-muted">{formatStatus(r.campaign.effectiveStatus)}</div>
                </td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.spend, currency)}</td>
                <td className="px-3 py-2.5 tabular">
                  {r.result !== null ? `${formatNumber(r.result)} ${r.resultLabel ?? ""}` : "N/A"}
                </td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpa, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpc, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatPercent(r.ctr)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(r.cpm, currency)}</td>
                <td className="px-3 py-2.5 tabular">{r.frequency !== null ? formatNumber(r.frequency, 2) : "N/A"}</td>
                <td className="px-3 py-2.5 tabular">{formatRoas(r.roas)}</td>
                <td className="px-3 py-2.5">
                  <RecommendationBadge action={r.campaign.recommendations[period].action} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-ink-muted">
                  Nenhuma campanha encontrada para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
