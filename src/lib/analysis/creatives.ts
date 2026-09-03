import type { NormalizedMetrics } from "../meta/metrics";
import { pickPrimaryCategory, computeAccountBaseline, type AccountBaseline } from "./recommendation";
import { THRESHOLDS } from "./thresholds";
import { pctDelta } from "./stats";

export type CreativeClassification = "vencedor" | "bom" | "observar" | "ruim" | "fadiga";

export const CLASSIFICATION_EMOJI: Record<CreativeClassification, string> = {
  vencedor: "🔥",
  bom: "🟢",
  observar: "🟡",
  ruim: "🔴",
  fadiga: "⚠️",
};

export const CLASSIFICATION_LABEL: Record<CreativeClassification, string> = {
  vencedor: "Vencedor",
  bom: "Bom",
  observar: "Observar",
  ruim: "Ruim",
  fadiga: "Possível fadiga",
};

export interface CreativeInsight {
  classification: CreativeClassification;
  reason: string;
  tags: string[];
  hasEnoughSample: boolean;
  primaryLabel: string | null;
  cpa: number | null;
  ctr: number | null;
  cpaDeltaVsMedian: number | null;
  ctrDeltaVsMean: number | null;
}

function fmtMoney(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPctAbs(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return `${Math.abs(v).toFixed(1)}%`;
}

/** Piso mínimo de gasto para considerar um padrão (fadiga, CTR alto/baixo) relevante — evita ruído em anúncios com centavos de gasto. */
const MIN_SPEND_FOR_PATTERN = THRESHOLDS.MIN_SPEND_FOR_CONFIDENT_CALL / 2;

export function computeAdBaseline(adsMetrics: NormalizedMetrics[]): AccountBaseline {
  return computeAccountBaseline(adsMetrics.filter((m) => m.spend > 0));
}

/**
 * Classifica um criativo (anúncio) comparando-o com a mediana/média de todos
 * os anúncios da conta no mesmo período — nunca classifica "vencedor" ou
 * "ruim" com amostra insuficiente (fica em "observar" até acumular dados).
 */
export function analyzeCreative(metrics: NormalizedMetrics, baseline: AccountBaseline): CreativeInsight {
  const primary = pickPrimaryCategory(metrics);
  const spend = metrics.spend;
  const ctr = metrics.ctr;
  const frequency = metrics.frequency;
  const cpa = primary?.costPer ?? null;
  const count = primary?.count ?? null;

  const categoryBaseline = primary ? baseline.cpaByCategory.get(primary.key) ?? null : null;
  const hasBaseline = !!categoryBaseline && categoryBaseline.n >= THRESHOLDS.MIN_CAMPAIGNS_FOR_BASELINE;
  const cpaDeltaVsMedian = hasBaseline && cpa !== null ? pctDelta(cpa, categoryBaseline!.median) : null;
  const ctrDeltaVsMean = ctr !== null ? pctDelta(ctr, baseline.ctr.mean) : null;

  const hasEnoughSample = spend >= THRESHOLDS.MIN_SPEND_FOR_CONFIDENT_CALL && (count ?? 0) >= THRESHOLDS.MIN_CONVERSIONS_FOR_CONFIDENT_CALL;
  const meaningfulSpend = spend >= MIN_SPEND_FOR_PATTERN;

  const tags: string[] = [];

  const wastingSpend = spend >= THRESHOLDS.SPEND_NO_CONVERSION_ALERT && (!primary || (count ?? 0) === 0);
  if (wastingSpend) tags.push("Consumindo orçamento sem conversões");

  const highFrequency = frequency !== null && frequency >= THRESHOLDS.FREQUENCY_HIGH;
  const ctrBelowAvg = ctrDeltaVsMean !== null && ctrDeltaVsMean <= THRESHOLDS.CTR_WORSE_PCT;
  const fatigueSignal = meaningfulSpend && highFrequency && ctrBelowAvg;
  if (fatigueSignal) tags.push("Frequência alta + CTR abaixo da média — possível fadiga de criativo");

  const highCtr = ctrDeltaVsMean !== null && ctrDeltaVsMean >= THRESHOLDS.CTR_BETTER_PCT;
  const poorConversion = !primary || (count ?? 0) === 0 || (cpaDeltaVsMedian !== null && cpaDeltaVsMedian >= THRESHOLDS.CPA_MUCH_WORSE_PCT);
  if (meaningfulSpend && highCtr && poorConversion) {
    tags.push("CTR alto, conversão fraca — pode indicar problema na página de destino/oferta, não no anúncio");
  }

  const lowCtr = ctrDeltaVsMean !== null && ctrDeltaVsMean <= THRESHOLDS.CTR_WORSE_PCT;
  const goodConversion = hasEnoughSample && cpaDeltaVsMedian !== null && cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT;
  if (lowCtr && goodConversion) {
    tags.push("CTR baixo, conversão eficiente — público qualificado apesar do criativo pouco chamativo");
  }

  const highEfficiency = cpaDeltaVsMedian !== null && cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT;
  if (highEfficiency) tags.push("Eficiência (CPA) acima da média da conta");

  let classification: CreativeClassification;
  let reason: string;

  if (wastingSpend) {
    classification = "ruim";
    reason = `Gasto de ${fmtMoney(spend)} sem nenhuma conversão registrada.`;
  } else if (fatigueSignal) {
    classification = "fadiga";
    reason = `Frequência de ${frequency!.toFixed(1)} com CTR ${fmtPctAbs(ctrDeltaVsMean)} abaixo da média da conta — sinal de saturação de público, não necessariamente de custo de mídia.`;
  } else if (hasEnoughSample && cpaDeltaVsMedian !== null && cpaDeltaVsMedian >= THRESHOLDS.CPA_MUCH_WORSE_PCT) {
    classification = "ruim";
    reason = `CPA (${fmtMoney(cpa)}) está ${fmtPctAbs(cpaDeltaVsMedian)} acima da mediana dos anúncios da conta (${fmtMoney(categoryBaseline!.median)}).`;
  } else if (
    hasEnoughSample &&
    ((cpaDeltaVsMedian !== null && cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT) ||
      (ctrDeltaVsMean !== null && ctrDeltaVsMean >= THRESHOLDS.CTR_BETTER_PCT * 2))
  ) {
    classification = "vencedor";
    const bits: string[] = [];
    if (cpaDeltaVsMedian !== null && cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT) {
      bits.push(`CPA (${fmtMoney(cpa)}) ${fmtPctAbs(cpaDeltaVsMedian)} abaixo da mediana da conta (${fmtMoney(categoryBaseline!.median)})`);
    }
    if (ctrDeltaVsMean !== null && ctrDeltaVsMean >= THRESHOLDS.CTR_BETTER_PCT * 2) {
      bits.push(`CTR (${ctr?.toFixed(2)}%) ${fmtPctAbs(ctrDeltaVsMean)} acima da média da conta (${baseline.ctr.mean?.toFixed(2)}%)`);
    }
    reason = `${bits.join(" e ")}, com amostra suficiente (gasto ${fmtMoney(spend)}, ${count} conversões).`;
  } else if (hasEnoughSample) {
    classification = "bom";
    reason = `Desempenho dentro do esperado para a conta — CPA ${fmtMoney(cpa)}, CTR ${ctr !== null ? ctr.toFixed(2) : "N/A"}%.`;
  } else {
    classification = "observar";
    reason = primary
      ? `Amostra pequena (gasto ${fmtMoney(spend)}, ${count ?? 0} conversões) — dados insuficientes para classificar como vencedor ou ruim com confiança.`
      : `Sem conversões mapeadas até agora (gasto ${fmtMoney(spend)}) — avaliação limitada a CTR/CPM.`;
  }

  return {
    classification,
    reason,
    tags,
    hasEnoughSample,
    primaryLabel: primary?.label ?? null,
    cpa,
    ctr,
    cpaDeltaVsMedian,
    ctrDeltaVsMean,
  };
}
