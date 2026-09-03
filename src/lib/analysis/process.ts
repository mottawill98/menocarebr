import { parseInsightRow, mergeDailyRows, EMPTY_METRICS, type NormalizedMetrics } from "../meta/metrics";
import type { RawInsightRow, CampaignEntity, AdSetEntity, AdEntity, Targeting, PromotedObject } from "../meta/types";
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_DAYS, PERIOD_ANCHOR_OFFSET, type PeriodKey } from "../periods";
import { getJson, setJson } from "../db";
import {
  analyzeCampaign,
  computeAccountBaseline,
  pickPrimaryCategory,
  type Recommendation,
} from "./recommendation";

async function readRaw<T>(accountId: string, name: string): Promise<T> {
  const value = await getJson<T>(`raw:${accountId}:${name}`);
  if (value === null) throw new Error(`Dado bruto ausente: raw:${accountId}:${name}`);
  return value;
}

function writeProcessed(accountId: string, name: string, data: unknown): Promise<void> {
  return setJson(`processed:${accountId}:${name}`, data);
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function periodsForId(
  windowData: Record<PeriodKey, RawInsightRow[]>,
  idField: keyof RawInsightRow,
  id: string
): Record<PeriodKey, NormalizedMetrics> {
  const result = {} as Record<PeriodKey, NormalizedMetrics>;
  for (const key of PERIOD_KEYS) {
    const row = windowData[key]?.find((r) => r[idField] === id);
    result[key] = parseInsightRow(row);
  }
  return result;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Para um período com duração conhecida (todos exceto "Máximo"), retorna as
 * métricas do próprio período e do período imediatamente anterior de mesma
 * duração, somando a série diária já coletada — usado para a tendência
 * "período atual vs. anterior" no motor de recomendação. Retorna métricas
 * vazias (hasData=false) quando o período não tem duração comparável (Máximo)
 * ou quando não há linhas diárias suficientes.
 */
function getPeriodTrend(
  dailyRows: RawInsightRow[],
  until: string,
  period: PeriodKey
): { current: NormalizedMetrics; previous: NormalizedMetrics } {
  const days = PERIOD_DAYS[period];
  if (days === null) return { current: { ...EMPTY_METRICS }, previous: { ...EMPTY_METRICS } };

  const untilDate = new Date(`${until}T00:00:00Z`);
  const anchor = new Date(untilDate.getTime() - PERIOD_ANCHOR_OFFSET[period] * DAY_MS);
  const currentStart = new Date(anchor.getTime() - (days - 1) * DAY_MS);
  const previousEnd = new Date(anchor.getTime() - days * DAY_MS);
  const previousStart = new Date(anchor.getTime() - (2 * days - 1) * DAY_MS);

  const current = dailyRows.filter(
    (r) => r.date_start && new Date(r.date_start) >= currentStart && new Date(r.date_start) <= anchor
  );
  const previous = dailyRows.filter(
    (r) => r.date_start && new Date(r.date_start) >= previousStart && new Date(r.date_start) <= previousEnd
  );

  return { current: mergeDailyRows(current), previous: mergeDailyRows(previous) };
}

export interface ChartPoint {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conversions: NormalizedMetrics["conversions"];
  purchaseRoas: number | null;
}

function toChartPoint(row: RawInsightRow): ChartPoint {
  const m = parseInsightRow(row);
  return {
    date: row.date_start ?? "",
    spend: m.spend,
    impressions: m.impressions,
    reach: m.reach,
    frequency: m.frequency,
    clicks: m.clicks,
    ctr: m.ctr,
    cpc: m.cpc,
    cpm: m.cpm,
    conversions: m.conversions,
    purchaseRoas: m.purchaseRoas,
  };
}

export interface ProcessedCampaign {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  bidStrategy: string | null;
  windows: Record<PeriodKey, NormalizedMetrics>;
  timeseries: ChartPoint[];
  recommendations: Record<PeriodKey, Recommendation>;
  adsetCount: number;
  adCount: number;
}

export interface ProcessedAdSet {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  bidStrategy: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  targeting: Targeting | null;
  promotedObject: PromotedObject | null;
  destinationType: string | null;
  windows: Record<PeriodKey, NormalizedMetrics>;
}

export interface AccountHealth {
  businessId: string | null;
  businessName: string | null;
  verificationStatus: string | null;
}

export interface ProcessedAd {
  id: string;
  name: string;
  adsetId: string;
  campaignId: string;
  status: string;
  effectiveStatus: string;
  creative: AdEntity["creative"] | null;
  windows: Record<PeriodKey, NormalizedMetrics>;
}

export interface ProcessedOverview {
  accountId: string;
  accountName: string | null;
  fetchedAt: string;
  dateRange: { since: string; until: string };
  historicalRange: { since: string; until: string };
  windows: Record<PeriodKey, NormalizedMetrics>;
  timeseries: ChartPoint[];
  campaignCount: number;
  activeCampaignCount: number;
  droppedFields: Record<string, string[]>;
  accountHealth: AccountHealth;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function processAccount(accountId: string): Promise<ProcessedOverview> {
  const accountsMeta = (await getJson<{ accounts: Array<{ id: string; name: string }> }>("raw:accounts"))?.accounts ?? [];
  const accountName = accountsMeta.find((a) => a.id === accountId)?.name ?? null;

  const [campaignsWrap, adsetsWrap, adsWrap, accountWindows, campaignWindows, adsetWindows, adWindows, accountDailyWrap, campaignDailyWrap] =
    await Promise.all([
      readRaw<{ data: CampaignEntity[] }>(accountId, "campaigns"),
      readRaw<{ data: AdSetEntity[] }>(accountId, "adsets"),
      readRaw<{ data: AdEntity[] }>(accountId, "ads"),
      readRaw<{ data: Record<PeriodKey, RawInsightRow[]>; droppedFields: string[] }>(accountId, "insights-account-windows"),
      readRaw<{ data: Record<PeriodKey, RawInsightRow[]>; droppedFields: string[] }>(accountId, "insights-campaigns-windows"),
      readRaw<{ data: Record<PeriodKey, RawInsightRow[]>; droppedFields: string[] }>(accountId, "insights-adsets-windows"),
      readRaw<{ data: Record<PeriodKey, RawInsightRow[]>; droppedFields: string[] }>(accountId, "insights-ads-windows"),
      readRaw<{ data: RawInsightRow[] }>(accountId, "insights-account"),
      readRaw<{ data: RawInsightRow[] }>(accountId, "insights-campaigns"),
    ]);
  const campaignsEntities = campaignsWrap.data;
  const adsetsEntities = adsetsWrap.data;
  const adsEntities = adsWrap.data;
  const accountDaily = accountDailyWrap.data;
  const campaignDaily = campaignDailyWrap.data;

  const campaignDailyById = groupBy(campaignDaily, (r) => r.campaign_id);

  const sortedAccountDaily = [...accountDaily].sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""));
  const dates = sortedAccountDaily.map((r) => r.date_start).filter(Boolean) as string[];
  const since = dates[0] ?? "";
  const until = dates[dates.length - 1] ?? "";

  const accountWindowsParsed = {} as Record<PeriodKey, NormalizedMetrics>;
  for (const key of PERIOD_KEYS) {
    accountWindowsParsed[key] = parseInsightRow(accountWindows.data[key]?.[0]);
  }
  const maxWindowRow = accountWindows.data.max?.[0];
  const historicalRange = {
    since: maxWindowRow?.date_start ?? since,
    until: maxWindowRow?.date_stop ?? until,
  };

  // Baseline da conta (para comparar cada campanha), calculada separadamente para cada período.
  const baselineByPeriod = {} as Record<PeriodKey, ReturnType<typeof computeAccountBaseline>>;
  for (const period of PERIOD_KEYS) {
    const metricsForPeriod = campaignsEntities.map((c) =>
      parseInsightRow(campaignWindows.data[period]?.find((r) => r.campaign_id === c.id))
    );
    baselineByPeriod[period] = computeAccountBaseline(metricsForPeriod);
  }

  const adsetCountByCampaign = groupBy(adsetsEntities, (a) => a.campaign_id);
  const adCountByCampaign = groupBy(adsEntities, (a) => a.campaign_id);

  const processedCampaigns: ProcessedCampaign[] = campaignsEntities.map((c) => {
    const windows = periodsForId(campaignWindows.data, "campaign_id", c.id);
    const dailyRows = (campaignDailyById.get(c.id) ?? []).sort((a, b) =>
      (a.date_start ?? "").localeCompare(b.date_start ?? "")
    );
    const timeseries = dailyRows.map(toChartPoint);

    const recommendations = {} as Record<PeriodKey, Recommendation>;
    for (const period of PERIOD_KEYS) {
      const { current, previous } = getPeriodTrend(dailyRows, until, period);
      recommendations[period] = analyzeCampaign({
        period,
        periodLabel: PERIOD_LABELS[period],
        metrics: windows[period],
        trendCurrent: current,
        trendPrevious: previous,
        baseline: baselineByPeriod[period],
      });
    }

    return {
      id: c.id,
      name: c.name,
      objective: c.objective ?? null,
      status: c.status,
      effectiveStatus: c.effective_status,
      dailyBudget: toNumberOrNull(c.daily_budget),
      lifetimeBudget: toNumberOrNull(c.lifetime_budget),
      bidStrategy: c.bid_strategy ?? null,
      windows,
      timeseries,
      recommendations,
      adsetCount: (adsetCountByCampaign.get(c.id) ?? []).length,
      adCount: (adCountByCampaign.get(c.id) ?? []).length,
    };
  });

  const processedAdSets: ProcessedAdSet[] = adsetsEntities.map((a) => ({
    id: a.id,
    name: a.name,
    campaignId: a.campaign_id,
    status: a.status,
    effectiveStatus: a.effective_status,
    dailyBudget: toNumberOrNull(a.daily_budget),
    lifetimeBudget: toNumberOrNull(a.lifetime_budget),
    bidStrategy: a.bid_strategy ?? null,
    optimizationGoal: a.optimization_goal ?? null,
    billingEvent: a.billing_event ?? null,
    targeting: a.targeting ?? null,
    promotedObject: a.promoted_object ?? null,
    destinationType: a.destination_type ?? null,
    windows: periodsForId(adsetWindows.data, "adset_id", a.id),
  }));

  const processedAds: ProcessedAd[] = adsEntities.map((a) => ({
    id: a.id,
    name: a.name,
    adsetId: a.adset_id,
    campaignId: a.campaign_id,
    status: a.status,
    effectiveStatus: a.effective_status,
    creative: a.creative ?? null,
    windows: periodsForId(adWindows.data, "ad_id", a.id),
  }));

  const accountHealthWrap = await getJson<{ data: AccountHealth }>(`raw:${accountId}:account-health`);
  const accountHealth: AccountHealth = accountHealthWrap?.data ?? {
    businessId: null,
    businessName: null,
    verificationStatus: null,
  };

  const overview: ProcessedOverview = {
    accountId,
    accountName,
    fetchedAt: new Date().toISOString(),
    dateRange: { since, until },
    historicalRange,
    windows: accountWindowsParsed,
    timeseries: sortedAccountDaily.map(toChartPoint),
    campaignCount: campaignsEntities.length,
    activeCampaignCount: campaignsEntities.filter((c) => c.effective_status === "ACTIVE").length,
    droppedFields: {
      account: accountWindows.droppedFields,
      campaign: campaignWindows.droppedFields,
      adset: adsetWindows.droppedFields,
      ad: adWindows.droppedFields,
    },
    accountHealth,
  };

  await Promise.all([
    writeProcessed(accountId, "overview", overview),
    writeProcessed(accountId, "campaigns", processedCampaigns),
    writeProcessed(accountId, "adsets", processedAdSets),
    writeProcessed(accountId, "ads", processedAds),
  ]);

  return overview;
}

export { pickPrimaryCategory };
