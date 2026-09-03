"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { PeriodSelector } from "./PeriodSelector";
import { EvolutionChart } from "./charts/EvolutionChart";
import { RecommendationBadge } from "./RecommendationBadge";
import { AlertBadgeRow } from "./AlertBadge";
import { getCategory, getCategoryFromList } from "@/lib/conversion-helpers";
import { pickPrimaryCategory } from "@/lib/analysis/recommendation";
import { buildCampaignDiagnostic } from "@/lib/analysis/narrative";
import { DiagnosticCard } from "./DiagnosticCard";
import { formatMoney, formatCompact, formatPercent, formatNumber, formatRoas, formatStatus } from "@/lib/format";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_DAYS, PERIOD_ANCHOR_OFFSET, PERIOD_LABELS, type PeriodKey } from "@/lib/periods";
import type { ProcessedCampaign, ProcessedAdSet, ProcessedAd, ChartPoint } from "@/lib/analysis/process";

function sliceTimeseries(timeseries: ChartPoint[], period: PeriodKey): ChartPoint[] {
  const days = PERIOD_DAYS[period];
  if (days === null) return timeseries;
  const offset = PERIOD_ANCHOR_OFFSET[period];
  const trimmed = offset > 0 ? timeseries.slice(0, timeseries.length - offset) : timeseries;
  return trimmed.slice(-days);
}

export function CampaignDetail({
  campaign,
  adsets,
  ads,
  currency,
}: {
  campaign: ProcessedCampaign;
  adsets: ProcessedAdSet[];
  ads: ProcessedAd[];
  currency: string;
}) {
  const [period] = usePeriod();
  const metrics = campaign.windows[period];
  const chartData = useMemo(() => sliceTimeseries(campaign.timeseries, period), [campaign.timeseries, period]);

  const purchase = getCategory(metrics, "purchase");
  const lead = getCategory(metrics, "lead");
  const rec = campaign.recommendations[period];
  const diagnostic = useMemo(
    () => buildCampaignDiagnostic(campaign.id, campaign.name, rec, PERIOD_LABELS[period], currency),
    [campaign.id, campaign.name, rec, period, currency]
  );

  const rankedAds = useMemo(() => {
    return [...ads]
      .map((a) => ({ ad: a, metrics: a.windows[period], primary: pickPrimaryCategory(a.windows[period]) }))
      .filter((a) => a.metrics.spend > 0)
      .sort((a, b) => {
        const aCpa = a.primary?.costPer ?? Infinity;
        const bCpa = b.primary?.costPer ?? Infinity;
        return aCpa - bCpa;
      });
  }, [ads, period]);

  const bestAds = rankedAds.slice(0, 3);
  const worstAds = [...rankedAds].reverse().slice(0, 3);

  return (
    <div className="space-y-6">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Voltar para campanhas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{campaign.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {formatStatus(campaign.effectiveStatus)} · Objetivo: {campaign.objective ?? "N/A"} · {campaign.adsetCount} conjuntos ·{" "}
            {campaign.adCount} anúncios
          </p>
        </div>
        <RecommendationBadge action={rec.action} />
      </div>

      <DiagnosticCard diagnostic={diagnostic} periodLabel={PERIOD_LABELS[period]} currency={currency} />

      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium text-ink-secondary">Ver todos os fatores considerados</summary>
        <ul className="mt-2 space-y-1 text-ink-secondary">
          {rec.reasons.map((reason, i) => (
            <li key={i}>• {reason}</li>
          ))}
        </ul>
      </details>

      {rec.alerts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {rec.alerts.map((a, i) => (
            <AlertBadgeRow key={i} alert={a} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Principais métricas</h3>
        <PeriodSelector />
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
        <KpiCard label="Leads" value={lead?.count != null ? formatCompact(lead.count) : "N/A"} />
        <KpiCard label="Compras (na Meta)" value={purchase?.count != null ? formatCompact(purchase.count) : "N/A"} />
        <KpiCard label="CPA Compra (na Meta)" value={formatMoney(purchase?.costPer ?? null, currency)} />
        <KpiCard label="CPL" value={formatMoney(lead?.costPer ?? null, currency)} />
        <KpiCard label="Receita atribuída (compras na Meta)" value={formatMoney(purchase?.value ?? null, currency)} />
        <KpiCard
          label="ROAS"
          value={formatRoas(metrics.purchaseRoas)}
          sublabel={metrics.purchaseRoas && metrics.purchaseRoas > 50 ? "Valor da API — validar pixel/CAPI" : undefined}
        />
        <KpiCard label="Ranking de qualidade" value={metrics.qualityRanking ?? "N/A"} />
        <KpiCard label="Ranking de engajamento" value={metrics.engagementRateRanking ?? "N/A"} />
        <KpiCard label="Ranking de conversão" value={metrics.conversionRateRanking ?? "N/A"} />
      </div>

      <h3 className="text-sm font-semibold text-ink">Evolução no tempo</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartBlock title="Gasto por dia" data={chartData} k="spend" color="var(--series-1)" fmt={(v) => formatMoney(v, currency)} />
        <ChartBlock title="CPC" data={chartData} k="cpc" color="var(--series-4)" fmt={(v) => formatMoney(v, currency)} />
        <ChartBlock title="CTR" data={chartData} k="ctr" color="var(--series-3)" fmt={(v) => formatPercent(v)} />
        <ChartBlock title="CPM" data={chartData} k="cpm" color="var(--series-2)" fmt={(v) => formatMoney(v, currency)} />
        <ChartBlock title="Frequência" data={chartData} k="frequency" color="var(--series-7)" fmt={(v) => formatNumber(v, 2)} />
        <ChartBlock title="ROAS (compras)" data={chartData} k="purchaseRoas" color="var(--series-6)" fmt={(v) => formatRoas(v)} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Conversões por dia (compra vs. lead)</h4>
        <EvolutionChart
          data={chartData.map((d) => ({
            date: d.date,
            purchases: getCategoryFromList(d.conversions, "purchase")?.count ?? 0,
            leads: getCategoryFromList(d.conversions, "lead")?.count ?? 0,
          }))}
          series={[
            { key: "purchases", label: "Compras", color: "var(--series-8)", formatter: (v) => formatNumber(v, 0) },
            { key: "leads", label: "Leads", color: "var(--series-5)", formatter: (v) => formatNumber(v, 0) },
          ]}
        />
      </div>

      <h3 className="text-sm font-semibold text-ink">Conjuntos de anúncios — {PERIOD_LABELS[period]}</h3>
      <EntityTable items={adsets} currency={currency} type="adset" period={period} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Melhores criativos (menor CPA, {PERIOD_LABELS[period]})</h3>
          <CreativeList items={bestAds} currency={currency} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Piores criativos (maior CPA, {PERIOD_LABELS[period]})</h3>
          <CreativeList items={worstAds} currency={currency} />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-ink">Todos os anúncios — {PERIOD_LABELS[period]}</h3>
      <EntityTable items={ads} currency={currency} type="ad" period={period} />
    </div>
  );
}

function ChartBlock({
  title,
  data,
  k,
  color,
  fmt,
}: {
  title: string;
  data: ChartPoint[];
  k: keyof ChartPoint;
  color: string;
  fmt: (v: number | null) => string;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-ink">{title}</h4>
      <EvolutionChart data={data} series={[{ key: k, label: title, color, formatter: fmt }]} />
    </div>
  );
}

function EntityTable({
  items,
  currency,
  type,
  period,
}: {
  items: (ProcessedAdSet | ProcessedAd)[];
  currency: string;
  type: "adset" | "ad";
  period: PeriodKey;
}) {
  if (!items.length) {
    return <p className="text-sm text-ink-muted">Nenhum {type === "adset" ? "conjunto" : "anúncio"} encontrado.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-ink-muted">
            <th className="px-3 py-2.5 font-medium">{type === "adset" ? "Conjunto" : "Anúncio"}</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Investimento</th>
            <th className="px-3 py-2.5 font-medium">Resultado</th>
            <th className="px-3 py-2.5 font-medium">CPA</th>
            <th className="px-3 py-2.5 font-medium">CTR</th>
            <th className="px-3 py-2.5 font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const m = item.windows[period];
            const primary = pickPrimaryCategory(m);
            return (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="max-w-[260px] truncate px-3 py-2.5 font-medium text-ink">{item.name}</td>
                <td className="px-3 py-2.5 text-ink-secondary">{formatStatus(item.effectiveStatus)}</td>
                <td className="px-3 py-2.5 tabular">{formatMoney(m.spend, currency)}</td>
                <td className="px-3 py-2.5 tabular">
                  {primary ? `${formatNumber(primary.count)} ${primary.label}` : "N/A"}
                </td>
                <td className="px-3 py-2.5 tabular">{formatMoney(primary?.costPer ?? null, currency)}</td>
                <td className="px-3 py-2.5 tabular">{formatPercent(m.ctr)}</td>
                <td className="px-3 py-2.5 tabular">{formatRoas(m.purchaseRoas)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface RankedAd {
  ad: ProcessedAd;
  metrics: ProcessedAd["windows"][PeriodKey];
  primary: ReturnType<typeof pickPrimaryCategory>;
}

function CreativeList({ items, currency }: { items: RankedAd[]; currency: string }) {
  if (!items.length) {
    return <p className="text-sm text-ink-muted">Sem anúncios com gasto suficiente no período selecionado.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map(({ ad, metrics, primary }) => (
        <div key={ad.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          {ad.creative?.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.creative.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-lg bg-page" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{ad.name}</div>
            <div className="text-xs text-ink-muted">
              {formatMoney(metrics.spend, currency)} · {primary ? `${formatNumber(primary.count)} ${primary.label}` : "sem conversões"}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold tabular text-ink">
            {formatMoney(primary?.costPer ?? null, currency)}
          </div>
        </div>
      ))}
    </div>
  );
}
