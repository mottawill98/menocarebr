"use client";

import { useMemo } from "react";
import Link from "next/link";
import { KpiCard } from "./KpiCard";
import { PeriodSelector } from "./PeriodSelector";
import { EvolutionChart } from "./charts/EvolutionChart";
import { RecommendationBadge } from "./RecommendationBadge";
import { AlertBadgeRow } from "./AlertBadge";
import { getCategory, getCategoryFromList } from "@/lib/conversion-helpers";
import { formatMoney, formatCompact, formatPercent, formatNumber, formatRoas, formatDate } from "@/lib/format";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_DAYS, PERIOD_ANCHOR_OFFSET, PERIOD_LABELS } from "@/lib/periods";
import { buildCampaignDiagnostic, buildExecutiveSummary, rankTopActions, type CampaignAnalysis } from "@/lib/analysis/narrative";
import { ExecutiveSummaryPanel } from "./ExecutiveSummaryPanel";
import { TopActionsPanel } from "./TopActionsPanel";
import type { ProcessedOverview, ProcessedCampaign, ChartPoint } from "@/lib/analysis/process";
import type { AccountAlert } from "@/lib/alerts";

function sliceTimeseries(timeseries: ChartPoint[], period: keyof typeof PERIOD_DAYS): ChartPoint[] {
  const days = PERIOD_DAYS[period];
  if (days === null) return timeseries;
  const offset = PERIOD_ANCHOR_OFFSET[period];
  const trimmed = offset > 0 ? timeseries.slice(0, timeseries.length - offset) : timeseries;
  return trimmed.slice(-days);
}

export function OverviewDashboard({
  overview,
  campaigns,
  currency,
}: {
  overview: ProcessedOverview;
  campaigns: ProcessedCampaign[];
  currency: string;
}) {
  const [period] = usePeriod();
  const metrics = overview.windows[period];
  const chartData = useMemo(() => sliceTimeseries(overview.timeseries, period), [overview.timeseries, period]);

  const purchase = getCategory(metrics, "purchase");
  const lead = getCategory(metrics, "lead");

  const { bestCampaigns, worstCampaigns, alerts, recommendationCounts } = useMemo(() => {
    const order = { ESCALAR: 0, MANTER: 1, OBSERVAR: 2, REDUZIR: 3, PAUSAR: 4 };
    const ranked = [...campaigns].sort(
      (a, b) => order[a.recommendations[period].action] - order[b.recommendations[period].action]
    );
    const best = ranked.filter((c) => c.recommendations[period].action === "ESCALAR").slice(0, 5);
    const worst = [...ranked]
      .reverse()
      .filter((c) => c.recommendations[period].action === "PAUSAR" || c.recommendations[period].action === "REDUZIR")
      .slice(0, 5);
    const allAlerts: AccountAlert[] = campaigns.flatMap((c) =>
      c.recommendations[period].alerts.map((a) => ({ ...a, campaignId: c.id, campaignName: c.name }))
    );
    const counts: Record<string, number> = {};
    for (const c of campaigns) {
      const action = c.recommendations[period].action;
      counts[action] = (counts[action] ?? 0) + 1;
    }
    return { bestCampaigns: best, worstCampaigns: worst, alerts: allAlerts, recommendationCounts: counts };
  }, [campaigns, period]);

  const analysisItems: CampaignAnalysis[] = useMemo(() => {
    const periodLabel = PERIOD_LABELS[period];
    return campaigns.map((c) => {
      const rec = c.recommendations[period];
      return { id: c.id, name: c.name, rec, diagnostic: buildCampaignDiagnostic(c.id, c.name, rec, periodLabel, currency) };
    });
  }, [campaigns, period, currency]);

  const executiveSummary = useMemo(
    () => buildExecutiveSummary(analysisItems, PERIOD_LABELS[period], currency),
    [analysisItems, period, currency]
  );
  const topActions = useMemo(() => rankTopActions(analysisItems, 5), [analysisItems]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Visão geral — {PERIOD_LABELS[period]}</h1>
          <p className="text-sm text-ink-muted">
            Histórico de KPIs desde {formatDate(overview.historicalRange.since)} · Gráficos diários:{" "}
            {formatDate(overview.dateRange.since)} — {formatDate(overview.dateRange.until)} ·{" "}
            {overview.campaignCount} campanhas ({overview.activeCampaignCount} ativas)
          </p>
        </div>
        <PeriodSelector />
      </div>

      <ExecutiveSummaryPanel summary={executiveSummary} />
      <TopActionsPanel actions={topActions} currency={currency} />

      <div className="flex flex-wrap gap-2 text-xs text-ink-secondary">
        {(["ESCALAR", "MANTER", "OBSERVAR", "REDUZIR", "PAUSAR"] as const).map((action) => (
          <span key={action} className="rounded-full border border-border bg-surface px-2.5 py-1">
            {action}: {recommendationCounts[action] ?? 0}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Investimento" value={formatMoney(metrics.spend, currency)} />
        <KpiCard label="Impressões" value={formatCompact(metrics.impressions)} />
        <KpiCard label="Alcance" value={formatCompact(metrics.reach)} />
        <KpiCard label="Cliques" value={formatCompact(metrics.clicks)} />
        <KpiCard label="CTR" value={formatPercent(metrics.ctr)} />
        <KpiCard label="CPC" value={formatMoney(metrics.cpc, currency)} />
        <KpiCard label="CPM" value={formatMoney(metrics.cpm, currency)} />
        <KpiCard label="Frequência" value={metrics.frequency !== null ? formatNumber(metrics.frequency, 2) : "N/A"} />
        <KpiCard label="Leads" value={lead?.count !== null && lead?.count !== undefined ? formatCompact(lead.count) : "N/A"} />
        <KpiCard label="Compras (na Meta)" value={purchase?.count !== null && purchase?.count !== undefined ? formatCompact(purchase.count) : "N/A"} />
        <KpiCard label="CPA Compra (na Meta)" value={formatMoney(purchase?.costPer ?? null, currency)} />
        <KpiCard label="CPL (custo por lead)" value={formatMoney(lead?.costPer ?? null, currency)} />
        <KpiCard label="Receita atribuída (compras na Meta)" value={formatMoney(purchase?.value ?? null, currency)} />
        <KpiCard
          label="ROAS"
          value={formatRoas(metrics.purchaseRoas)}
          sublabel={metrics.purchaseRoas && metrics.purchaseRoas > 50 ? "Valor da API — validar pixel/CAPI" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Gasto por dia</h3>
          <EvolutionChart
            data={chartData}
            series={[{ key: "spend", label: "Gasto", color: "var(--series-1)", formatter: (v) => formatMoney(v, currency) }]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">CTR e CPM</h3>
          <EvolutionChart
            data={chartData}
            series={[
              { key: "ctr", label: "CTR", color: "var(--series-3)", formatter: (v) => formatPercent(v) },
              { key: "cpm", label: "CPM", color: "var(--series-2)", formatter: (v) => formatMoney(v, currency) },
            ]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">CPC</h3>
          <EvolutionChart
            data={chartData}
            series={[{ key: "cpc", label: "CPC", color: "var(--series-4)", formatter: (v) => formatMoney(v, currency) }]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Frequência</h3>
          <EvolutionChart
            data={chartData}
            series={[{ key: "frequency", label: "Frequência", color: "var(--series-7)", formatter: (v) => formatNumber(v, 2) }]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">ROAS (compras)</h3>
          <EvolutionChart
            data={chartData}
            series={[{ key: "purchaseRoas", label: "ROAS", color: "var(--series-6)", formatter: (v) => formatRoas(v) }]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Conversões (compras) por dia</h3>
          <EvolutionChart
            data={chartData.map((d) => ({
              date: d.date,
              purchases: getCategoryFromList(d.conversions, "purchase")?.count ?? 0,
            }))}
            series={[
              {
                key: "purchases",
                label: "Compras",
                color: "var(--series-8)",
                formatter: (v) => formatNumber(v, 0),
              },
            ]}
          />
        </div>
      </div>

      {alerts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Alertas — {PERIOD_LABELS[period]}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {alerts.slice(0, 12).map((a, i) => (
              <Link key={i} href={`/campaigns/${a.campaignId}`}>
                <AlertBadgeRow alert={a} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Melhores campanhas (ESCALAR)</h3>
          <CampaignMiniList campaigns={bestCampaigns} currency={currency} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Piores campanhas (REDUZIR / PAUSAR)</h3>
          <CampaignMiniList campaigns={worstCampaigns} currency={currency} />
        </div>
      </div>
    </div>
  );
}

function CampaignMiniList({ campaigns, currency }: { campaigns: ProcessedCampaign[]; currency: string }) {
  const [period] = usePeriod();
  if (!campaigns.length) {
    return <p className="text-sm text-ink-muted">Nenhuma campanha nesta categoria no momento.</p>;
  }
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {campaigns.map((c) => (
        <Link
          key={c.id}
          href={`/campaigns/${c.id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{c.name}</div>
            <div className="text-xs text-ink-muted">{c.recommendations[period].reasons[0]}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-ink-secondary tabular">{formatMoney(c.windows[period].spend, currency)}</span>
            <RecommendationBadge action={c.recommendations[period].action} />
          </div>
        </Link>
      ))}
    </div>
  );
}
