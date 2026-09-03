import type { NormalizedMetrics } from "../meta/metrics";
import type { CategoryResult, ConversionCategoryKey } from "../meta/actions";
import type { PeriodKey } from "../periods";
import { THRESHOLDS, PRIMARY_RESULT_PRIORITY } from "./thresholds";
import { mean, median, pctDelta } from "./stats";

export type RecommendationAction = "ESCALAR" | "MANTER" | "OBSERVAR" | "REDUZIR" | "PAUSAR";
export type Confidence = "baixa" | "media" | "alta";

export interface Alert {
  type:
    | "cpa_increase"
    | "ctr_drop"
    | "cpm_increase"
    | "frequency_high"
    | "spend_no_conversion"
    | "roas_drop"
    | "positive_outlier";
  severity: "info" | "atencao" | "critico";
  message: string;
}

/**
 * Sinais numéricos brutos usados para chegar à recomendação — expostos para
 * que a camada de narrativa (diagnóstico/problema/oportunidade/impacto) possa
 * explicar o "porquê" sem recalcular nada, e para que a UI possa citar os
 * mesmos números que embasaram a decisão.
 */
export interface RecommendationSignals {
  spend: number;
  primaryCount: number | null;
  revenue: number | null;
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
  roas: number | null;
  cpaDeltaVsMedian: number | null;
  categoryMedianCpa: number | null;
  ctrDeltaVsMean: number | null;
  accountMeanCtr: number | null;
  cpaTrendPct: number | null;
  ctrTrendPct: number | null;
  cpmTrendPct: number | null;
  roasTrendPct: number | null;
  hasEnoughSample: boolean;
  hasTrendData: boolean;
  hasBaseline: boolean;
}

export interface Recommendation {
  action: RecommendationAction;
  confidence: Confidence;
  reasons: string[];
  alerts: Alert[];
  primaryCategory: ConversionCategoryKey | null;
  primaryCategoryLabel: string | null;
  period: PeriodKey;
  signals: RecommendationSignals;
}

function fmtMoney(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct1(v: number | null): string {
  if (v === null) return "N/A";
  return `${v.toFixed(1)}%`;
}

/** Escolhe a categoria de conversão "principal" (resultado) com maior prioridade que tenha volume > 0. */
export function pickPrimaryCategory(metrics: NormalizedMetrics): CategoryResult | null {
  for (const key of PRIMARY_RESULT_PRIORITY) {
    const found = metrics.conversions.find((c) => c.key === key && (c.count ?? 0) > 0);
    if (found) return found;
  }
  const linkClick = metrics.conversions.find((c) => c.key === "link_click" && (c.count ?? 0) > 0);
  return linkClick ?? null;
}

export interface AccountBaseline {
  ctr: { mean: number | null; median: number | null };
  cpm: { mean: number | null; median: number | null };
  cpaByCategory: Map<ConversionCategoryKey, { mean: number | null; median: number | null; n: number }>;
  campaignCount: number;
}

export function computeAccountBaseline(
  campaignsWindowMetrics: NormalizedMetrics[]
): AccountBaseline {
  const ctrValues = campaignsWindowMetrics.map((m) => m.ctr).filter((v): v is number => v !== null);
  const cpmValues = campaignsWindowMetrics.map((m) => m.cpm).filter((v): v is number => v !== null);

  const byCategory = new Map<ConversionCategoryKey, number[]>();
  for (const m of campaignsWindowMetrics) {
    const primary = pickPrimaryCategory(m);
    if (!primary || primary.costPer === null) continue;
    const list = byCategory.get(primary.key) ?? [];
    list.push(primary.costPer);
    byCategory.set(primary.key, list);
  }

  const cpaByCategory = new Map<ConversionCategoryKey, { mean: number | null; median: number | null; n: number }>();
  for (const [key, values] of byCategory.entries()) {
    cpaByCategory.set(key, { mean: mean(values), median: median(values), n: values.length });
  }

  return {
    ctr: { mean: mean(ctrValues), median: median(ctrValues) },
    cpm: { mean: mean(cpmValues), median: median(cpmValues) },
    cpaByCategory,
    campaignCount: campaignsWindowMetrics.length,
  };
}

export interface AnalyzeCampaignInput {
  period: PeriodKey;
  periodLabel: string;
  metrics: NormalizedMetrics;
  /** Métricas do período imediatamente anterior, de mesma duração (derivadas da série diária). EMPTY_METRICS quando não há dados suficientes para comparar (ex.: período "Máximo"). */
  trendCurrent: NormalizedMetrics;
  trendPrevious: NormalizedMetrics;
  baseline: AccountBaseline;
}

function baseSignals(metrics: NormalizedMetrics, primary: CategoryResult | null, baseline: AccountBaseline): RecommendationSignals {
  return {
    spend: metrics.spend,
    primaryCount: primary?.count ?? null,
    revenue: primary?.value ?? null,
    cpa: primary?.costPer ?? null,
    ctr: metrics.ctr,
    cpm: metrics.cpm,
    frequency: metrics.frequency,
    roas: metrics.purchaseRoas,
    cpaDeltaVsMedian: null,
    categoryMedianCpa: null,
    ctrDeltaVsMean: null,
    accountMeanCtr: baseline.ctr.mean,
    cpaTrendPct: null,
    ctrTrendPct: null,
    cpmTrendPct: null,
    roasTrendPct: null,
    hasEnoughSample: false,
    hasTrendData: false,
    hasBaseline: false,
  };
}

export function analyzeCampaign(input: AnalyzeCampaignInput): Recommendation {
  const { period, periodLabel, metrics, trendCurrent, trendPrevious, baseline } = input;
  const primary = pickPrimaryCategory(metrics);

  const reasons: string[] = [];
  const alerts: Alert[] = [];

  // Regra de maior prioridade: gasto relevante sem nenhuma conversão do resultado esperado.
  if (metrics.spend >= THRESHOLDS.SPEND_NO_CONVERSION_ALERT && (!primary || (primary.count ?? 0) === 0)) {
    const msg = `Gasto de ${fmtMoney(metrics.spend)} em "${periodLabel}" sem nenhuma conversão registrada.`;
    alerts.push({ type: "spend_no_conversion", severity: "critico", message: msg });
    return {
      action: "PAUSAR",
      confidence: "alta",
      reasons: [msg],
      alerts,
      primaryCategory: primary?.key ?? null,
      primaryCategoryLabel: primary?.label ?? null,
      period,
      signals: { ...baseSignals(metrics, primary, baseline), hasTrendData: trendCurrent.hasData },
    };
  }

  if (!primary) {
    return {
      action: "OBSERVAR",
      confidence: "baixa",
      reasons: [
        `Nenhum evento de conversão mapeado (purchase, lead, mensagens, checkout ou carrinho) foi encontrado para esta campanha em "${periodLabel}" — avaliação limitada a CTR/CPM.`,
      ],
      alerts,
      primaryCategory: null,
      primaryCategoryLabel: null,
      period,
      signals: { ...baseSignals(metrics, primary, baseline), hasTrendData: trendCurrent.hasData },
    };
  }

  const categoryBaseline = baseline.cpaByCategory.get(primary.key) ?? null;
  const hasBaseline = !!categoryBaseline && categoryBaseline.n >= THRESHOLDS.MIN_CAMPAIGNS_FOR_BASELINE;
  const cpaDeltaVsMedian = hasBaseline ? pctDelta(primary.costPer, categoryBaseline!.median) : null;
  const ctrDeltaVsMean = pctDelta(metrics.ctr, baseline.ctr.mean);

  // Comparação com o período imediatamente anterior de mesma duração (quando disponível).
  const primaryTrendCurrent = pickPrimaryCategory(trendCurrent);
  const primaryTrendPrevious = trendPrevious.conversions.find((c) => c.key === primary!.key) ?? null;
  const cpaTrend =
    trendCurrent.hasData && primaryTrendCurrent?.key === primary.key && primaryTrendPrevious
      ? pctDelta(primaryTrendCurrent.costPer, primaryTrendPrevious.costPer)
      : null;
  const ctrTrend = trendCurrent.hasData ? pctDelta(trendCurrent.ctr, trendPrevious.ctr) : null;
  const cpmTrend = trendCurrent.hasData ? pctDelta(trendCurrent.cpm, trendPrevious.cpm) : null;
  const roasTrend = trendCurrent.hasData ? pctDelta(trendCurrent.purchaseRoas, trendPrevious.purchaseRoas) : null;

  let scoreUp = 0;
  let scoreDown = 0;

  if (cpaDeltaVsMedian !== null && cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT) {
    scoreUp += 2;
    reasons.push(
      `CPA de ${primary.label} (${fmtMoney(primary.costPer)}) está ${fmtPct1(Math.abs(cpaDeltaVsMedian))} abaixo da mediana da conta (${fmtMoney(categoryBaseline!.median)}) para o mesmo tipo de resultado.`
    );
  }
  if (ctrDeltaVsMean !== null && ctrDeltaVsMean >= THRESHOLDS.CTR_BETTER_PCT) {
    scoreUp += 1;
    reasons.push(
      `CTR (${metrics.ctr?.toFixed(2)}%) está ${fmtPct1(ctrDeltaVsMean)} acima da média da conta (${baseline.ctr.mean?.toFixed(2)}%).`
    );
  }
  if (metrics.purchaseRoas !== null && metrics.purchaseRoas >= THRESHOLDS.ROAS_GOOD) {
    scoreUp += metrics.purchaseRoas >= THRESHOLDS.ROAS_GREAT ? 2 : 1;
    reasons.push(`ROAS de ${metrics.purchaseRoas.toFixed(2)}x em "${periodLabel}".`);
  }

  if (cpaDeltaVsMedian !== null && cpaDeltaVsMedian >= THRESHOLDS.CPA_MUCH_WORSE_PCT) {
    scoreDown += 2;
    reasons.push(
      `CPA de ${primary.label} (${fmtMoney(primary.costPer)}) está ${fmtPct1(cpaDeltaVsMedian)} acima da mediana da conta (${fmtMoney(categoryBaseline!.median)}).`
    );
  } else if (cpaDeltaVsMedian !== null && cpaDeltaVsMedian >= THRESHOLDS.CPA_MILD_WORSE_PCT) {
    scoreDown += 1;
    reasons.push(`CPA de ${primary.label} está ${fmtPct1(cpaDeltaVsMedian)} acima da mediana da conta.`);
  }
  if (ctrDeltaVsMean !== null && ctrDeltaVsMean <= THRESHOLDS.CTR_WORSE_PCT) {
    scoreDown += 1;
    reasons.push(`CTR está ${fmtPct1(Math.abs(ctrDeltaVsMean))} abaixo da média da conta.`);
    alerts.push({ type: "ctr_drop", severity: "atencao", message: `CTR ${fmtPct1(ctrDeltaVsMean)} vs. média da conta.` });
  }
  if (cpaTrend !== null && cpaTrend >= THRESHOLDS.CPA_TREND_WORSE_PCT) {
    scoreDown += 1;
    const msg = `CPA piorou ${fmtPct1(cpaTrend)} no período atual frente ao período imediatamente anterior de mesma duração.`;
    reasons.push(msg);
    alerts.push({ type: "cpa_increase", severity: "atencao", message: msg });
  }
  if (ctrTrend !== null && ctrTrend <= THRESHOLDS.CTR_TREND_WORSE_PCT) {
    scoreDown += 1;
    alerts.push({
      type: "ctr_drop",
      severity: "atencao",
      message: `CTR caiu ${fmtPct1(Math.abs(ctrTrend))} no período atual vs. período anterior de mesma duração.`,
    });
  }
  if (cpmTrend !== null && cpmTrend >= THRESHOLDS.CPM_TREND_WORSE_PCT) {
    scoreDown += 1;
    alerts.push({
      type: "cpm_increase",
      severity: "atencao",
      message: `CPM subiu ${fmtPct1(cpmTrend)} no período atual vs. período anterior de mesma duração.`,
    });
  }
  if (roasTrend !== null && roasTrend <= THRESHOLDS.ROAS_TREND_WORSE_PCT) {
    scoreDown += 1;
    alerts.push({
      type: "roas_drop",
      severity: "critico",
      message: `ROAS caiu ${fmtPct1(Math.abs(roasTrend))} no período atual vs. período anterior de mesma duração.`,
    });
  }
  if (metrics.frequency !== null && metrics.frequency >= THRESHOLDS.FREQUENCY_HIGH) {
    scoreDown += 1;
    alerts.push({
      type: "frequency_high",
      severity: "atencao",
      message: `Frequência de ${metrics.frequency.toFixed(1)} em "${periodLabel}" — possível fadiga de criativo.`,
    });
  }

  const hasEnoughSample =
    metrics.spend >= THRESHOLDS.MIN_SPEND_FOR_CONFIDENT_CALL &&
    (primary.count ?? 0) >= THRESHOLDS.MIN_CONVERSIONS_FOR_CONFIDENT_CALL;

  let action: RecommendationAction;
  let confidence: Confidence;

  if (scoreDown >= 4 || (cpaDeltaVsMedian !== null && cpaDeltaVsMedian >= THRESHOLDS.CPA_MUCH_WORSE_PCT && scoreDown >= 3)) {
    action = hasEnoughSample ? "PAUSAR" : "REDUZIR";
    confidence = hasEnoughSample ? "alta" : "media";
  } else if (scoreDown >= 2) {
    action = "REDUZIR";
    confidence = hasEnoughSample ? "media" : "baixa";
  } else if (scoreUp >= 2 && scoreDown === 0) {
    action = hasEnoughSample ? "ESCALAR" : "OBSERVAR";
    confidence = hasEnoughSample ? "alta" : "baixa";
    if (!hasEnoughSample) {
      reasons.push(
        `Amostra ainda pequena (gasto ${fmtMoney(metrics.spend)}, ${primary.count} conversões) para recomendar ESCALAR com confiança — mantendo em OBSERVAR.`
      );
    } else {
      alerts.push({
        type: "positive_outlier",
        severity: "info",
        message: `Campanha com desempenho significativamente acima da média da conta.`,
      });
    }
  } else if (scoreUp >= 1 && scoreDown === 0) {
    action = "MANTER";
    confidence = "media";
  } else if (scoreDown === 1) {
    action = "OBSERVAR";
    confidence = "baixa";
  } else {
    action = "MANTER";
    confidence = hasBaseline ? "media" : "baixa";
  }

  if (reasons.length === 0) {
    reasons.push(
      `Sem variação relevante frente à mediana da conta ou ao histórico recente para ${primary.label} (CPA ${fmtMoney(primary.costPer)}).`
    );
  }

  return {
    action,
    confidence,
    reasons,
    alerts,
    primaryCategory: primary.key,
    primaryCategoryLabel: primary.label,
    period,
    signals: {
      spend: metrics.spend,
      primaryCount: primary.count,
      revenue: primary.value,
      cpa: primary.costPer,
      ctr: metrics.ctr,
      cpm: metrics.cpm,
      frequency: metrics.frequency,
      roas: metrics.purchaseRoas,
      cpaDeltaVsMedian,
      categoryMedianCpa: categoryBaseline?.median ?? null,
      ctrDeltaVsMean,
      accountMeanCtr: baseline.ctr.mean,
      cpaTrendPct: cpaTrend,
      ctrTrendPct: ctrTrend,
      cpmTrendPct: cpmTrend,
      roasTrendPct: roasTrend,
      hasEnoughSample,
      hasTrendData: trendCurrent.hasData,
      hasBaseline,
    },
  };
}
