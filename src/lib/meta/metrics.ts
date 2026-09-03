import {
  extractConversionCategories,
  toNumber,
  correctMonetaryValueForActionType,
  type ActionEntry,
  type CategoryResult,
} from "./actions";
import type { RawInsightRow } from "./types";

export interface NormalizedMetrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  inlineLinkClicks: number;
  uniqueClicks: number;
  ctr: number | null;
  uniqueCtr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpp: number | null;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  conversions: CategoryResult[];
  purchaseRoas: number | null;
  websitePurchaseRoas: number | null;
  dateStart: string | null;
  dateStop: string | null;
  hasData: boolean;
}

/**
 * Busca um ROAS num array purchase_roas/website_purchase_roas por uma lista
 * de action_types específica do campo (esses campos da API só populam certos
 * action_types fixos — não a mesma lista usada para a categoria "purchase").
 */
function findRoas(entries: ActionEntry[] | undefined, actionTypes: string[]): number | null {
  if (!entries?.length) return null;
  for (const type of actionTypes) {
    const found = entries.find((e) => e.action_type === type);
    // O ROAS é revenue/spend, então a mesma correção de "valor em centavos"
    // (ver correctMonetaryValueForActionType) se aplica proporcionalmente à razão.
    if (found) return correctMonetaryValueForActionType(type, toNumber(found.value));
  }
  return null;
}

export const EMPTY_METRICS: NormalizedMetrics = {
  spend: 0,
  impressions: 0,
  reach: 0,
  frequency: null,
  clicks: 0,
  inlineLinkClicks: 0,
  uniqueClicks: 0,
  ctr: null,
  uniqueCtr: null,
  cpc: null,
  cpm: null,
  cpp: null,
  qualityRanking: null,
  engagementRateRanking: null,
  conversionRateRanking: null,
  conversions: extractConversionCategories(undefined, undefined, undefined),
  purchaseRoas: null,
  websitePurchaseRoas: null,
  dateStart: null,
  dateStop: null,
  hasData: false,
};

/** Normaliza uma única linha de insights, tal como retornada pela Graph API (sem recálculo). */
export function parseInsightRow(row: RawInsightRow | undefined): NormalizedMetrics {
  if (!row) return { ...EMPTY_METRICS };

  const spend = toNumber(row.spend);
  const conversions = extractConversionCategories(row.actions, row.action_values, row.cost_per_action_type, spend);
  // ROAS é sempre derivado do valor da categoria "purchase" (compra na Meta) já
  // corrigida, e não do campo purchase_roas da API — esse campo é fixo em
  // omni_purchase e não refletiria a restrição de escopo pedida pelo cliente.
  const purchaseCategory = conversions.find((c) => c.key === "purchase");
  const purchaseRoas = purchaseCategory?.value && spend > 0 ? purchaseCategory.value / spend : null;

  return {
    spend,
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    frequency: row.frequency !== undefined ? toNumber(row.frequency) : null,
    clicks: toNumber(row.clicks),
    inlineLinkClicks: toNumber(row.inline_link_clicks),
    uniqueClicks: toNumber(row.unique_clicks),
    ctr: row.ctr !== undefined ? toNumber(row.ctr) : null,
    uniqueCtr: row.unique_ctr !== undefined ? toNumber(row.unique_ctr) : null,
    cpc: row.cpc !== undefined ? toNumber(row.cpc) : null,
    cpm: row.cpm !== undefined ? toNumber(row.cpm) : null,
    cpp: row.cpp !== undefined ? toNumber(row.cpp) : null,
    qualityRanking: row.quality_ranking ?? null,
    engagementRateRanking: row.engagement_rate_ranking ?? null,
    conversionRateRanking: row.conversion_rate_ranking ?? null,
    conversions,
    purchaseRoas,
    websitePurchaseRoas: findRoas(row.website_purchase_roas, ["offsite_conversion.fb_pixel_purchase"]),
    dateStart: row.date_start ?? null,
    dateStop: row.date_stop ?? null,
    hasData: true,
  };
}

/**
 * Soma um conjunto de linhas diárias (mesma entidade) em um único período.
 * Usado para comparar período recente vs. anterior a partir da série diária
 * já coletada — não substitui os agregados nativos da Meta (last_7d/last_14d/
 * last_30d/maximum), que são usados para os KPIs "oficiais".
 *
 * Atenção: `reach`/`frequency`/`unique_ctr` aqui são aproximações (soma de
 * alcance diário não deduplica usuários entre dias) — ver limitações no relatório.
 */
export function mergeDailyRows(rows: RawInsightRow[]): NormalizedMetrics {
  if (!rows.length) return { ...EMPTY_METRICS };

  let spend = 0;
  let impressions = 0;
  let reach = 0;
  let clicks = 0;
  let inlineLinkClicks = 0;
  let uniqueClicks = 0;
  const actionsMap = new Map<string, number>();
  const actionValuesMap = new Map<string, number>();
  let dateStart: string | null = null;
  let dateStop: string | null = null;

  const addToMap = (map: Map<string, number>, entries: ActionEntry[] | undefined) => {
    for (const e of entries ?? []) {
      map.set(e.action_type, (map.get(e.action_type) ?? 0) + toNumber(e.value));
    }
  };

  for (const row of rows) {
    spend += toNumber(row.spend);
    impressions += toNumber(row.impressions);
    reach += toNumber(row.reach);
    clicks += toNumber(row.clicks);
    inlineLinkClicks += toNumber(row.inline_link_clicks);
    uniqueClicks += toNumber(row.unique_clicks);
    addToMap(actionsMap, row.actions);
    addToMap(actionValuesMap, row.action_values);
    if (row.date_start && (!dateStart || row.date_start < dateStart)) dateStart = row.date_start;
    if (row.date_stop && (!dateStop || row.date_stop > dateStop)) dateStop = row.date_stop;
  }

  const actionsArr: ActionEntry[] = Array.from(actionsMap.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
  const actionValuesArr: ActionEntry[] = Array.from(actionValuesMap.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));

  const conversions = extractConversionCategories(actionsArr, actionValuesArr, undefined, spend);

  const purchaseCategory = conversions.find((c) => c.key === "purchase");
  const purchaseRoas = purchaseCategory?.value && spend > 0 ? purchaseCategory.value / spend : null;

  return {
    spend,
    impressions,
    reach,
    frequency: reach > 0 ? impressions / reach : null,
    clicks,
    inlineLinkClicks,
    uniqueClicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    uniqueCtr: reach > 0 ? (uniqueClicks / reach) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpp: reach > 0 ? (spend / reach) * 1000 : null,
    qualityRanking: null,
    engagementRateRanking: null,
    conversionRateRanking: null,
    conversions,
    purchaseRoas,
    websitePurchaseRoas: null,
    dateStart,
    dateStop,
    hasData: rows.length > 0,
  };
}
