import type { Recommendation, RecommendationAction, Confidence, RecommendationSignals } from "./recommendation";
import { THRESHOLDS } from "./thresholds";

export interface EstimatedImpact {
  kind: "economia" | "receita_incremental" | "volume_incremental";
  /** Valor em moeda para economia/receita_incremental; contagem de conversões para volume_incremental. */
  value: number;
  description: string;
}

export interface CampaignDiagnostic {
  campaignId: string;
  campaignName: string;
  diagnosis: string;
  problem: string | null;
  opportunity: string | null;
  recommendationText: string;
  confidence: Confidence;
  action: RecommendationAction;
  impact: EstimatedImpact | null;
}

export interface CampaignAnalysis {
  id: string;
  name: string;
  rec: Recommendation;
  diagnostic: CampaignDiagnostic;
}

export interface ExecutiveSummary {
  whatsWorking: string;
  whatWorsened: string;
  whatImproved: string;
  whereWastingMoney: string;
  whereToScale: string;
  urgentCampaign: string;
  mainProblem: string;
}

export interface TopAction {
  campaignId: string;
  campaignName: string;
  action: RecommendationAction;
  recommendationText: string;
  impact: EstimatedImpact | null;
  priorityScore: number;
}

function fmtMoney(v: number | null, currency: string): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

/** Magnitude sem sinal — para usar ao lado de uma palavra de direção ("subiu X%"), nunca duplicando o sinal. */
function fmtPctAbs(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return `${Math.abs(v).toFixed(1)}%`;
}

/** Abaixo disso, uma variação é tratada como ruído/estável na narrativa (independe dos limiares de alerta, que continuam mais altos). */
const NARRATIVE_STABLE_BAND_PCT = 5;

/**
 * Monta a narrativa causal (o "porquê") a partir dos sinais já calculados pelo
 * motor de recomendação — nunca reinterpreta os números, só os conecta em uma
 * explicação. Segue o estilo: "CPA subiu X%, CPM estável, CTR caiu Y% → sugere
 * deterioração de eficiência, não custo de mídia."
 */
function buildTrendSentences(s: RecommendationSignals, periodLabel: string, currency: string): string[] {
  if (!s.hasTrendData) return [];

  const sentences: string[] = [];
  const { cpaTrendPct, cpmTrendPct, ctrTrendPct, roasTrendPct } = s;

  const cpaWorse = cpaTrendPct !== null && cpaTrendPct >= THRESHOLDS.CPA_TREND_WORSE_PCT;
  const cpaBetter = cpaTrendPct !== null && cpaTrendPct <= -THRESHOLDS.CPA_TREND_WORSE_PCT;
  const cpmWorse = cpmTrendPct !== null && cpmTrendPct >= THRESHOLDS.CPM_TREND_WORSE_PCT;
  const cpmStable = cpmTrendPct !== null && Math.abs(cpmTrendPct) < THRESHOLDS.CPM_TREND_WORSE_PCT;
  const ctrWorse = ctrTrendPct !== null && ctrTrendPct <= THRESHOLDS.CTR_TREND_WORSE_PCT;
  const ctrBetter = ctrTrendPct !== null && ctrTrendPct >= Math.abs(THRESHOLDS.CTR_TREND_WORSE_PCT);
  const roasWorse = roasTrendPct !== null && roasTrendPct <= THRESHOLDS.ROAS_TREND_WORSE_PCT;

  if (cpaTrendPct !== null) {
    const flat = Math.abs(cpaTrendPct) < NARRATIVE_STABLE_BAND_PCT;
    const verb = flat ? "permaneceu estável" : cpaTrendPct > 0 ? `aumentou ${fmtPctAbs(cpaTrendPct)}` : `caiu ${fmtPctAbs(cpaTrendPct)}`;
    sentences.push(
      `CPA ${verb} no período atual (${periodLabel}) frente ao período imediatamente anterior de mesma duração${s.cpa !== null ? ` — agora em ${fmtMoney(s.cpa, currency)}` : ""}.`
    );
  }
  if (cpmTrendPct !== null) {
    const flat = Math.abs(cpmTrendPct) < NARRATIVE_STABLE_BAND_PCT;
    const verb = flat ? "permaneceu estável" : cpmTrendPct > 0 ? `subiu ${fmtPctAbs(cpmTrendPct)}` : `caiu ${fmtPctAbs(cpmTrendPct)}`;
    sentences.push(`O CPM ${verb}${s.cpm !== null ? ` (${fmtMoney(s.cpm, currency)})` : ""}.`);
  }
  if (ctrTrendPct !== null) {
    const flat = Math.abs(ctrTrendPct) < NARRATIVE_STABLE_BAND_PCT;
    const verb = flat ? "permaneceu estável" : ctrTrendPct < 0 ? `também caiu ${fmtPctAbs(ctrTrendPct)}` : `subiu ${fmtPctAbs(ctrTrendPct)}`;
    sentences.push(`O CTR ${verb}.`);
  }

  if (cpaWorse && cpmStable && ctrWorse) {
    sentences.push("Isso sugere deterioração da eficiência do anúncio (fadiga de criativo ou saturação de público), e não aumento de custo de mídia.");
  } else if (cpaWorse && cpmWorse && !ctrWorse) {
    sentences.push("Isso sugere aumento de custo de mídia (leilão mais competitivo), não perda de eficiência do criativo.");
  } else if (cpaWorse && cpmWorse && ctrWorse) {
    sentences.push("Mídia mais cara e menor eficiência do anúncio parecem estar contribuindo juntas para a piora.");
  } else if (cpaWorse && cpmStable && !ctrWorse) {
    sentences.push("CPA piorou sem queda de CTR ou aumento de CPM — pode indicar queda na conversão pós-clique (site/checkout) ou no ticket médio, não um problema de mídia.");
  } else if (cpaBetter && ctrBetter) {
    sentences.push("Melhora consistente: CTR subiu e CPA caiu, indicando criativo e/ou segmentação mais eficientes.");
  } else if (roasWorse && !cpaWorse) {
    sentences.push("Queda de ROAS sem piora proporcional de CPA sugere redução no ticket médio (valor por compra), não piora de eficiência de mídia.");
  }

  if (s.frequency !== null && s.frequency >= THRESHOLDS.FREQUENCY_HIGH) {
    sentences.push(`Frequência de ${s.frequency.toFixed(1)} reforça a hipótese de saturação de público.`);
  }

  return sentences;
}

function buildBaselineSentence(s: RecommendationSignals, currency: string): string | null {
  if (!s.hasBaseline || s.cpaDeltaVsMedian === null || s.categoryMedianCpa === null) return null;
  const direction = s.cpaDeltaVsMedian < 0 ? "abaixo" : "acima";
  return `Frente à mediana da conta (${fmtMoney(s.categoryMedianCpa, currency)}), o CPA desta campanha está ${fmtPctAbs(s.cpaDeltaVsMedian)} ${direction}.`;
}

/**
 * Nomeia o problema com base direta nos sinais (não no array `alerts`, que
 * mistura "vs. média da conta" e "vs. período anterior" sob o mesmo tipo
 * "ctr_drop") — evita rótulos ambíguos que possam contradizer o diagnóstico.
 */
function deriveProblem(rec: Recommendation): string | null {
  const s = rec.signals;
  if (rec.alerts.some((a) => a.type === "spend_no_conversion")) return "Gasto sem conversão";
  if (s.hasTrendData && s.frequency !== null && s.frequency >= THRESHOLDS.FREQUENCY_HIGH && s.ctrTrendPct !== null && s.ctrTrendPct <= THRESHOLDS.CTR_TREND_WORSE_PCT) {
    return "Fadiga de criativo / saturação de público";
  }
  if (s.hasTrendData && s.cpaTrendPct !== null && s.cpaTrendPct >= THRESHOLDS.CPA_TREND_WORSE_PCT && s.cpmTrendPct !== null && s.cpmTrendPct >= THRESHOLDS.CPM_TREND_WORSE_PCT) {
    return "Aumento de custo de mídia";
  }
  if (s.hasTrendData && s.roasTrendPct !== null && s.roasTrendPct <= THRESHOLDS.ROAS_TREND_WORSE_PCT) {
    return "Queda de ROAS no período recente";
  }
  if (s.hasTrendData && s.ctrTrendPct !== null && s.ctrTrendPct <= THRESHOLDS.CTR_TREND_WORSE_PCT) {
    return "Queda de CTR no período recente";
  }
  if (s.cpaDeltaVsMedian !== null && s.cpaDeltaVsMedian >= THRESHOLDS.CPA_MUCH_WORSE_PCT) {
    return "CPA acima da mediana da conta";
  }
  if (s.ctrDeltaVsMean !== null && s.ctrDeltaVsMean <= THRESHOLDS.CTR_WORSE_PCT) {
    return "CTR abaixo da média da conta";
  }
  if (rec.action === "PAUSAR" || rec.action === "REDUZIR") return "Desempenho abaixo do esperado para a conta";
  return null;
}

function deriveOpportunity(rec: Recommendation): string | null {
  const s = rec.signals;
  if (rec.action === "ESCALAR") return "CPA/CTR/ROAS acima da média da conta — espaço para escalar orçamento com segurança";
  if (s.hasTrendData && s.cpaTrendPct !== null && s.cpaTrendPct <= -THRESHOLDS.CPA_TREND_WORSE_PCT) return "Tendência recente de melhora no CPA";
  if (s.ctrDeltaVsMean !== null && s.ctrDeltaVsMean >= THRESHOLDS.CTR_BETTER_PCT) return "CTR bem acima da média da conta";
  if (s.cpaDeltaVsMedian !== null && s.cpaDeltaVsMedian <= THRESHOLDS.CPA_MUCH_BETTER_PCT) return "CPA bem abaixo da mediana da conta";
  return null;
}

function deriveRecommendationText(rec: Recommendation, periodLabel: string, currency: string): string {
  const s = rec.signals;
  switch (rec.action) {
    case "PAUSAR":
      return `Pausar a campanha e realocar o orçamento (~${fmtMoney(s.spend, currency)} em "${periodLabel}") para campanhas com melhor desempenho.`;
    case "REDUZIR":
      return `Reduzir o orçamento em ~30-40% e revisar criativos/segmentação antes de continuar investindo no nível atual.`;
    case "OBSERVAR":
      return s.hasEnoughSample
        ? "Sinais mistos — monitorar de perto nos próximos dias antes de decidir escalar ou reduzir."
        : `Aguardar mais dados antes de decidir (amostra pequena: ${fmtMoney(s.spend, currency)} de gasto, ${s.primaryCount ?? 0} conversões).`;
    case "MANTER":
      return "Manter o orçamento atual — desempenho estável e dentro do esperado para a conta.";
    case "ESCALAR":
      return "Aumentar o orçamento em ~20-30% e monitorar CPA/CTR nas próximas 48-72h antes de escalar mais.";
    default:
      return "Monitorar.";
  }
}

const INCREMENTAL_BUDGET_FRACTION = 0.3;
const REDUCE_BUDGET_FRACTION = 0.4;

function estimateImpact(rec: Recommendation, periodLabel: string, currency: string): EstimatedImpact | null {
  const s = rec.signals;
  if (rec.action === "PAUSAR") {
    return {
      kind: "economia",
      value: s.spend,
      description: `Pausar evita gastar ~${fmtMoney(s.spend, currency)} a cada período (${periodLabel}) sem retorno proporcional.`,
    };
  }
  if (rec.action === "REDUZIR") {
    const value = s.spend * REDUCE_BUDGET_FRACTION;
    return {
      kind: "economia",
      value,
      description: `Reduzir ~${REDUCE_BUDGET_FRACTION * 100}% do orçamento economiza ~${fmtMoney(value, currency)} por período (${periodLabel}).`,
    };
  }
  if (rec.action === "ESCALAR") {
    const incrementalSpend = s.spend * INCREMENTAL_BUDGET_FRACTION;
    if (s.roas !== null && s.roas > 0) {
      const value = incrementalSpend * s.roas;
      return {
        kind: "receita_incremental",
        value,
        description: `Aumentar ~${INCREMENTAL_BUDGET_FRACTION * 100}% o orçamento (+${fmtMoney(incrementalSpend, currency)}) pode gerar ~${fmtMoney(value, currency)} em receita incremental, mantendo o ROAS atual de ${s.roas.toFixed(2)}x.`,
      };
    }
    if (s.primaryCount !== null && s.primaryCount > 0 && s.cpa !== null && s.cpa > 0) {
      const incrementalCount = incrementalSpend / s.cpa;
      return {
        kind: "volume_incremental",
        value: incrementalCount,
        description: `Aumentar ~${INCREMENTAL_BUDGET_FRACTION * 100}% o orçamento (+${fmtMoney(incrementalSpend, currency)}) pode gerar ~${Math.round(incrementalCount)} conversões adicionais, mantendo o CPA atual.`,
      };
    }
  }
  return null;
}

export function buildCampaignDiagnostic(
  campaignId: string,
  campaignName: string,
  rec: Recommendation,
  periodLabel: string,
  currency: string
): CampaignDiagnostic {
  const trendSentences = buildTrendSentences(rec.signals, periodLabel, currency);
  const baselineSentence = buildBaselineSentence(rec.signals, currency);
  const sentences = [...trendSentences, baselineSentence].filter((x): x is string => !!x);

  if (!rec.signals.hasEnoughSample) {
    sentences.push(
      `Volume de dados ainda limitado (gasto ${fmtMoney(rec.signals.spend, currency)}, ${rec.signals.primaryCount ?? 0} conversões) — trate as conclusões acima com cautela.`
    );
  }

  return {
    campaignId,
    campaignName,
    diagnosis: sentences.length ? sentences.join(" ") : "Dados insuficientes para uma leitura de tendência neste período.",
    problem: deriveProblem(rec),
    opportunity: deriveOpportunity(rec),
    recommendationText: deriveRecommendationText(rec, periodLabel, currency),
    confidence: rec.confidence,
    action: rec.action,
    impact: estimateImpact(rec, periodLabel, currency),
  };
}

export function buildExecutiveSummary(items: CampaignAnalysis[], periodLabel: string, currency: string): ExecutiveSummary {
  const escalar = items.filter((i) => i.rec.action === "ESCALAR");
  const manter = items.filter((i) => i.rec.action === "MANTER");
  const pausar = items.filter((i) => i.rec.action === "PAUSAR");
  const reduzir = items.filter((i) => i.rec.action === "REDUZIR");

  const worsened = items.filter(({ rec }) => {
    const s = rec.signals;
    if (!s.hasTrendData) return false;
    return (
      (s.cpaTrendPct !== null && s.cpaTrendPct >= THRESHOLDS.CPA_TREND_WORSE_PCT) ||
      (s.ctrTrendPct !== null && s.ctrTrendPct <= THRESHOLDS.CTR_TREND_WORSE_PCT) ||
      (s.cpmTrendPct !== null && s.cpmTrendPct >= THRESHOLDS.CPM_TREND_WORSE_PCT) ||
      (s.roasTrendPct !== null && s.roasTrendPct <= THRESHOLDS.ROAS_TREND_WORSE_PCT)
    );
  });
  const improved = items.filter(({ rec }) => {
    const s = rec.signals;
    if (!s.hasTrendData) return false;
    return (
      (s.cpaTrendPct !== null && s.cpaTrendPct <= -THRESHOLDS.CPA_TREND_WORSE_PCT) ||
      (s.ctrTrendPct !== null && s.ctrTrendPct >= Math.abs(THRESHOLDS.CTR_TREND_WORSE_PCT))
    );
  });

  const names = (list: CampaignAnalysis[], n = 3) =>
    list
      .slice(0, n)
      .map((i) => i.name)
      .join(", ") + (list.length > n ? ` e mais ${list.length - n}` : "");

  const whatsWorking =
    escalar.length + manter.length > 0
      ? `${escalar.length} campanha(s) com desempenho acima da média (candidatas a escalar) e ${manter.length} estáveis dentro do esperado. Destaques: ${names([...escalar, ...manter])}.`
      : "Nenhuma campanha se destacou positivamente neste período.";

  const whatWorsened = worsened.length
    ? `${worsened.length} campanha(s) pioraram no período recente frente ao período anterior de mesma duração: ${names(worsened)}.`
    : "Nenhuma campanha apresentou piora relevante de tendência no período recente.";

  const whatImproved = improved.length
    ? `${improved.length} campanha(s) melhoraram CPA e/ou CTR no período recente: ${names(improved)}.`
    : "Nenhuma campanha apresentou melhora relevante de tendência no período recente.";

  const wasting = [...pausar, ...reduzir].filter((i) => i.diagnostic.impact);
  const totalWaste = wasting.reduce((sum, i) => sum + (i.diagnostic.impact?.value ?? 0), 0);
  const whereWastingMoney = wasting.length
    ? `${wasting.length} campanha(s) somam ~${fmtMoney(totalWaste, currency)} de desperdício/ineficiência estimada por período (${periodLabel}): ${names(wasting)}.`
    : "Nenhum desperdício relevante identificado neste período.";

  const scaleCandidates = escalar.filter((i) => i.rec.confidence === "alta");
  const totalUpside = scaleCandidates.reduce(
    (sum, i) => sum + (i.diagnostic.impact?.kind === "receita_incremental" ? i.diagnostic.impact.value : 0),
    0
  );
  const whereToScale = scaleCandidates.length
    ? `${scaleCandidates.length} campanha(s) com evidência forte para escalar${totalUpside > 0 ? `, com receita incremental estimada de ~${fmtMoney(totalUpside, currency)}` : ""}: ${names(scaleCandidates)}.`
    : escalar.length
      ? `${escalar.length} campanha(s) sinalizam oportunidade de escala, mas ainda com confiança média/baixa — vale acompanhar antes de aumentar orçamento de forma agressiva.`
      : "Nenhuma campanha com evidência forte o suficiente para escalar agressivamente agora.";

  const mostUrgent =
    [...pausar].sort((a, b) => (b.diagnostic.impact?.value ?? 0) - (a.diagnostic.impact?.value ?? 0))[0] ??
    [...reduzir].sort((a, b) => (b.diagnostic.impact?.value ?? 0) - (a.diagnostic.impact?.value ?? 0))[0];
  const urgentCampaign = mostUrgent
    ? `${mostUrgent.name} — ${mostUrgent.diagnostic.problem ?? "requer revisão"}. ${mostUrgent.diagnostic.recommendationText}`
    : "Nenhuma campanha em estado crítico no momento.";

  const problemCounts = new Map<string, number>();
  for (const i of items) {
    if (i.diagnostic.problem) problemCounts.set(i.diagnostic.problem, (problemCounts.get(i.diagnostic.problem) ?? 0) + 1);
  }
  const topProblem = [...problemCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const mainProblem = topProblem
    ? `"${topProblem[0]}" é o padrão mais comum, afetando ${topProblem[1]} de ${items.length} campanha(s) analisadas.`
    : "Nenhum problema sistêmico identificado — desempenho dentro do esperado na maior parte das campanhas.";

  return { whatsWorking, whatWorsened, whatImproved, whereWastingMoney, whereToScale, urgentCampaign, mainProblem };
}

export function rankTopActions(items: CampaignAnalysis[], n = 5): TopAction[] {
  return items
    .filter((i) => i.diagnostic.impact !== null && (i.rec.action === "PAUSAR" || i.rec.action === "REDUZIR" || i.rec.action === "ESCALAR"))
    .map((i) => ({
      campaignId: i.id,
      campaignName: i.name,
      action: i.rec.action,
      recommendationText: i.diagnostic.recommendationText,
      impact: i.diagnostic.impact,
      priorityScore: i.diagnostic.impact?.kind === "volume_incremental" ? (i.diagnostic.impact.value * (i.rec.signals.cpa ?? 0)) : (i.diagnostic.impact?.value ?? 0),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, n);
}
