import { analyzeCreative, computeAdBaseline } from "./creatives";
import { pickPrimaryCategory } from "./recommendation";
import type { ProcessedCampaign, ProcessedAdSet, ProcessedAd } from "./process";
import type { PeriodKey } from "../periods";
import { THRESHOLDS } from "./thresholds";

const GENDER_LABELS: Record<number, string> = { 1: "Homens", 2: "Mulheres" };

export interface AudienceProfile {
  ageMin: number | null;
  ageMax: number | null;
  genderLabel: string;
  countries: string[];
  locationTypes: string[];
  advantageAudience: boolean;
  sampleSize: number;
  totalWinningAdsets: number;
}

export interface DeliverySetup {
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
  pixelId: string | null;
  customEventType: string | null;
  pageId: string | null;
  destinationType: string | null;
  sampleSize: number;
  totalWinningAdsets: number;
}

export interface RecommendedCreative {
  adId: string;
  name: string;
  objectType: string | null;
  title: string | null;
  body: string | null;
  thumbnailUrl: string | null;
  cpa: number | null;
  ctr: number | null;
  roas: number | null;
}

export interface CampaignDraft {
  key: "escalar" | "prova_social" | "advantage_audience";
  title: string;
  objective: string;
  suggestedDailyBudget: number | null;
  budgetRationale: string;
  audience: AudienceProfile | null;
  audienceVariant: AudienceProfile | null;
  delivery: DeliverySetup | null;
  creatives: RecommendedCreative[];
  reason: string;
  confidence: "baixa" | "media" | "alta";
  implementationNote: string;
}

export interface CampaignPlan {
  hasEnoughData: boolean;
  winningAdsCount: number;
  accountUsesAdvantageAudience: boolean;
  drafts: CampaignDraft[];
}

function mostCommon<T, K>(items: T[], keyFn: (item: T) => K): { value: T; count: number; total: number } | null {
  if (!items.length) return null;
  const groups = new Map<string, { value: T; count: number }>();
  for (const item of items) {
    const key = JSON.stringify(keyFn(item));
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { value: item, count: 1 });
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
  return { value: sorted[0].value, count: sorted[0].count, total: items.length };
}

function toCreative(row: { ad: ProcessedAd; cpa: number | null; ctr: number | null; roas: number | null }): RecommendedCreative {
  return {
    adId: row.ad.id,
    name: row.ad.name,
    objectType: row.ad.creative?.object_type ?? null,
    title: row.ad.creative?.title ?? null,
    body: row.ad.creative?.body ?? null,
    thumbnailUrl: row.ad.creative?.thumbnail_url ?? null,
    cpa: row.cpa,
    ctr: row.ctr,
    roas: row.roas,
  };
}

function fmtMoney(v: number | null, currency: string): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

export function buildCampaignPlan(
  campaigns: ProcessedCampaign[],
  adsets: ProcessedAdSet[],
  ads: ProcessedAd[],
  period: PeriodKey,
  currency: string
): CampaignPlan {
  const adsetById = new Map(adsets.map((a) => [a.id, a]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const adsWithMetrics = ads.map((a) => a.windows[period]).filter((m) => m.spend > 0);
  const adBaseline = computeAdBaseline(adsWithMetrics);

  const analyzed = ads.map((a) => {
    const metrics = a.windows[period];
    const insight = analyzeCreative(metrics, adBaseline);
    const purchase = pickPrimaryCategory(metrics);
    return { ad: a, metrics, insight, cpa: insight.cpa, ctr: metrics.ctr, roas: metrics.purchaseRoas, count: purchase?.count ?? 0 };
  });

  const winners = analyzed
    .filter((r) => r.insight.classification === "vencedor")
    .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));

  const winningAdsCount = winners.length;
  const accountUsesAdvantageAudience = adsets.some((a) => (a.targeting?.targeting_automation?.advantage_audience ?? 0) === 1);

  if (winningAdsCount < THRESHOLDS.MIN_CAMPAIGNS_FOR_BASELINE) {
    return { hasEnoughData: false, winningAdsCount, accountUsesAdvantageAudience, drafts: [] };
  }

  const winnerAdsets = winners
    .map((w) => adsetById.get(w.ad.adsetId))
    .filter((a): a is ProcessedAdSet => !!a && !!a.targeting);

  const audienceMode = mostCommon(winnerAdsets, (a) => ({
    age_min: a.targeting!.age_min,
    age_max: a.targeting!.age_max,
    genders: a.targeting!.genders,
    countries: a.targeting!.geo_locations?.countries,
    location_types: a.targeting!.geo_locations?.location_types,
  }));

  const deliveryMode = mostCommon(winnerAdsets, (a) => ({
    optimization_goal: a.optimizationGoal,
    billing_event: a.billingEvent,
    bid_strategy: a.bidStrategy,
    pixel_id: a.promotedObject?.pixel_id,
    custom_event_type: a.promotedObject?.custom_event_type,
    page_id: a.promotedObject?.page_id,
    destination_type: a.destinationType,
  }));

  const audience: AudienceProfile | null = audienceMode
    ? {
        ageMin: audienceMode.value.targeting!.age_min ?? null,
        ageMax: audienceMode.value.targeting!.age_max ?? null,
        genderLabel:
          (audienceMode.value.targeting!.genders ?? []).map((g) => GENDER_LABELS[g] ?? `Gênero ${g}`).join("/") || "Todos",
        countries: audienceMode.value.targeting!.geo_locations?.countries ?? [],
        locationTypes: audienceMode.value.targeting!.geo_locations?.location_types ?? [],
        advantageAudience: (audienceMode.value.targeting!.targeting_automation?.advantage_audience ?? 0) === 1,
        sampleSize: audienceMode.count,
        totalWinningAdsets: audienceMode.total,
      }
    : null;

  const delivery: DeliverySetup | null = deliveryMode
    ? {
        optimizationGoal: deliveryMode.value.optimizationGoal,
        billingEvent: deliveryMode.value.billingEvent,
        bidStrategy: deliveryMode.value.bidStrategy,
        pixelId: deliveryMode.value.promotedObject?.pixel_id ?? null,
        customEventType: deliveryMode.value.promotedObject?.custom_event_type ?? null,
        pageId: deliveryMode.value.promotedObject?.page_id ?? null,
        destinationType: deliveryMode.value.destinationType,
        sampleSize: deliveryMode.count,
        totalWinningAdsets: deliveryMode.total,
      }
    : null;

  // Orçamento de referência: mediana do orçamento diário (CBO) das campanhas que contêm os vencedores.
  const winningCampaignBudgets = [...new Set(winners.map((w) => w.ad.campaignId))]
    .map((id) => campaignById.get(id)?.dailyBudget)
    .filter((b): b is number => b !== null && b !== undefined)
    .map((cents) => cents / 100)
    .sort((a, b) => a - b);
  const medianBudget = winningCampaignBudgets.length
    ? winningCampaignBudgets[Math.floor(winningCampaignBudgets.length / 2)]
    : null;

  const confidenceForAudience = (mode: { count: number; total: number } | null): "baixa" | "media" | "alta" => {
    if (!mode || mode.total === 0) return "baixa";
    const ratio = mode.count / mode.total;
    if (ratio >= 0.8 && mode.total >= THRESHOLDS.MIN_CAMPAIGNS_FOR_BASELINE) return "alta";
    if (ratio >= 0.5) return "media";
    return "baixa";
  };

  const topCreatives = winners.slice(0, 5).map(toCreative);
  const overallConfidence = confidenceForAudience(audienceMode);

  const drafts: CampaignDraft[] = [];

  // Draft 1 — Escala consolidada.
  drafts.push({
    key: "escalar",
    title: "Escala consolidada dos vencedores",
    objective: "OUTCOME_SALES",
    suggestedDailyBudget: medianBudget !== null ? Math.round(medianBudget * 0.35) : null,
    budgetRationale: medianBudget !== null
      ? `Início conservador (~35%) da mediana de orçamento diário já validada nas campanhas de origem (${fmtMoney(medianBudget, currency)}/dia), para consolidar antes de igualar o orçamento.`
      : "Não há orçamento de referência suficiente nas campanhas de origem para sugerir um valor — comece com um valor de teste pequeno e escale por desempenho.",
    audience,
    audienceVariant: null,
    delivery,
    creatives: topCreatives,
    reason: `Os ${winningAdsCount} anúncios classificados como 🔥 vencedor em "${period}" compartilham ${audienceMode ? `o mesmo público em ${audienceMode.count} de ${audienceMode.total} conjuntos` : "configurações inconsistentes de público"}. Consolidar os melhores criativos numa única estrutura CBO evita que compitam por orçamento com anúncios OBSERVAR/REDUZIR dentro das campanhas originais.`,
    confidence: overallConfidence,
    implementationNote: "1 conjunto de anúncios (evitar duplicar o mesmo público em 2 conjuntos — gera concorrência interna no leilão).",
  });

  // Draft 2 — Teste de variação a partir do criativo de destaque entre os vencedores.
  const standout = [...winners].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0] ?? null;
  const standoutAvgCtrOthers =
    winners.length > 1
      ? winners.filter((w) => w.ad.id !== standout?.ad.id).reduce((sum, w) => sum + (w.ctr ?? 0), 0) / (winners.length - 1)
      : null;
  drafts.push({
    key: "prova_social",
    title: "Teste de variações a partir do criativo de destaque",
    objective: "OUTCOME_SALES",
    suggestedDailyBudget: medianBudget !== null ? Math.round(medianBudget * 0.15) : null,
    budgetRationale: "Orçamento de teste (não de escala) — a hipótese ainda não foi validada em mais de um criativo.",
    audience,
    audienceVariant: null,
    delivery,
    creatives: standout ? [toCreative(standout)] : [],
    reason: standout
      ? `"${standout.ad.name}" tem o maior CTR entre os vencedores (${standout.ctr?.toFixed(2)}%${standoutAvgCtrOthers !== null ? ` vs. ${standoutAvgCtrOthers.toFixed(2)}% da média dos demais vencedores` : ""}). Vale criar 2-3 variações a partir do mesmo ângulo/hook (ver título e texto reais abaixo) para confirmar se é um padrão replicável ou um resultado isolado.`
      : "Nenhum criativo de destaque identificado nesta amostra.",
    confidence: winners.length >= 5 ? "media" : "baixa",
    implementationNote: "Estrutura de campanha e conjunto podem ser criadas agora; os anúncios com as novas variações precisam de criativo novo (imagem/vídeo) antes de subir.",
  });

  // Draft 3 — Teste de expansão de público (Advantage+ Audience).
  const advantageVariant: AudienceProfile | null = audience
    ? { ...audience, advantageAudience: true, sampleSize: 0, totalWinningAdsets: audience.totalWinningAdsets }
    : null;
  drafts.push({
    key: "advantage_audience",
    title: "Teste de expansão de público (Advantage+ Audience)",
    objective: "OUTCOME_SALES",
    suggestedDailyBudget: medianBudget !== null ? Math.round(medianBudget * 0.2) : null,
    budgetRationale: "Orçamento de teste pareado (metade para o conjunto controle, metade para o conjunto com Advantage+).",
    audience,
    audienceVariant: advantageVariant,
    delivery,
    creatives: topCreatives,
    reason: accountUsesAdvantageAudience
      ? "Alguns conjuntos da conta já usam Advantage+ Audience — comparar diretamente com o público manual vencedor ajuda a decidir se vale migrar mais campanhas."
      : `Nenhum conjunto da conta usa Advantage+ Audience hoje (0 de ${adsets.filter((a) => a.targeting).length} conjuntos com targeting analisados). O público manual vencedor é estreito (uma faixa etária, um gênero, sem interesses) — bom para eficiência, mas um teto natural de escala. Testar Advantage+ pareado com um controle idêntico é a forma mais segura de descobrir se dá para crescer sem perder o CPA atual.`,
    confidence: "baixa",
    implementationNote: "2 conjuntos (controle com público manual + teste com Advantage+), mesmos criativos nos dois — a única variável testada é o público.",
  });

  return { hasEnoughData: true, winningAdsCount, accountUsesAdvantageAudience, drafts };
}
