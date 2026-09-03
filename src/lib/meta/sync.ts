import { graphGet, graphGetAllPages, MetaGraphError } from "./client";
import { buildInsightsFields, ENTITY_FIELDS } from "./fields";
import type { AdEntity, AdSetEntity, CampaignEntity, RawInsightRow } from "./types";
import { PERIOD_PRESETS, PERIOD_KEYS, type PeriodKey } from "../periods";
import { getJson, setJson } from "../db";

export type { PeriodKey } from "../periods";
export { PERIOD_PRESETS as WINDOW_PRESETS } from "../periods";

/**
 * Executa `fetchFn` e grava o resultado sob `key`. Se `force` for false e já
 * houver algo salvo, reaproveita em vez de refazer a chamada (retomada após
 * rate limit/erro intermitente da Meta). Com `force: true` (disparado pelo
 * botão "Atualizar dados agora"), sempre busca dados novos — nunca reexibe
 * uma sincronização antiga como se fosse atual.
 */
async function cachedFetch<T>(key: string, fetchFn: () => Promise<T>, force: boolean): Promise<T> {
  if (!force) {
    const cached = await getJson<T>(key);
    if (cached !== null) {
      console.log(`[sync] reaproveitando ${key} já salvo`);
      return cached;
    }
  }
  const result = await fetchFn();
  await setJson(key, result);
  console.log(`[sync] salvo ${key}`);
  return result;
}

/**
 * Busca insights com fallback: se a Graph API rejeitar um campo específico
 * (comum quando a conta não suporta certos campos, ex.: purchase_roas em
 * contas sem pixel de compra), removemos o campo problemático e tentamos
 * de novo, em vez de quebrar a coleta inteira.
 */
async function fetchInsightsWithFallback(
  accountId: string,
  level: "account" | "campaign" | "adset" | "ad",
  extraParams: Record<string, string>,
  fieldsOverride?: string[]
): Promise<{ rows: RawInsightRow[]; droppedFields: string[] }> {
  let fields = fieldsOverride ?? buildInsightsFields(level).split(",");
  const droppedFields: string[] = [];

  for (let attempt = 0; attempt < fields.length + 1; attempt++) {
    try {
      const rows = await graphGetAllPages<RawInsightRow>(`/${accountId}/insights`, {
        level,
        fields: fields.join(","),
        limit: PAGE_LIMIT[level],
        ...extraParams,
      });
      return { rows, droppedFields };
    } catch (err) {
      if (err instanceof MetaGraphError) {
        const message = err.payload?.error?.message ?? "";
        const badField = fields.find((f) => message.includes(f));
        if (badField) {
          fields = fields.filter((f) => f !== badField);
          droppedFields.push(badField);
          continue;
        }
      }
      throw err;
    }
  }
  return { rows: [], droppedFields };
}

/** Gera janelas de N dias [since, until] entre duas datas (inclusive). */
function dayChunks(since: string, until: string, chunkDays: number): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  let cursor = new Date(start);

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      since: cursor.toISOString().slice(0, 10),
      until: chunkEnd.toISOString().slice(0, 10),
    });

    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

/** Tamanho de janela por nível: níveis mais granulares geram respostas maiores por dia. */
const CHUNK_DAYS: Record<"account" | "campaign" | "adset" | "ad", number> = {
  account: 45,
  campaign: 45,
  adset: 21,
  ad: 14,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAGE_LIMIT: Record<"account" | "campaign" | "adset" | "ad", string> = {
  account: "300",
  campaign: "300",
  adset: "150",
  ad: "100",
};

/**
 * Busca insights diários (time_increment=1) em janelas de N dias, em vez de
 * uma única chamada cobrindo todo o range. Contas com muito histórico fazem a
 * Graph API retornar erro 500/2 ("unknown error") quando o range completo é
 * pedido de uma vez; dividir em blocos evita o timeout no lado da Meta.
 */
async function fetchDailyInsightsChunked(
  accountId: string,
  level: "account" | "campaign" | "adset" | "ad",
  since: string,
  until: string
): Promise<{ rows: RawInsightRow[]; droppedFields: string[] }> {
  const fields = buildInsightsFields(level).split(",");
  let activeFields = fields;
  const allRows: RawInsightRow[] = [];
  const droppedFieldsSet = new Set<string>();

  for (const chunk of dayChunks(since, until, CHUNK_DAYS[level])) {
    const { rows, droppedFields } = await fetchInsightsWithFallback(
      accountId,
      level,
      {
        time_increment: "1",
        time_range: JSON.stringify({ since: chunk.since, until: chunk.until }),
      },
      activeFields
    );
    droppedFields.forEach((f) => droppedFieldsSet.add(f));
    if (droppedFields.length) {
      activeFields = activeFields.filter((f) => !droppedFields.includes(f));
    }
    allRows.push(...rows);
    await sleep(600);
  }

  return { rows: allRows, droppedFields: Array.from(droppedFieldsSet) };
}

/**
 * Busca, para um nível, os agregados nativos da Meta para cada período
 * suportado pela dashboard (hoje/ontem/3/7/14/30 dias/máximo) — uma linha por
 * entidade por período, já com reach/frequency/ctr deduplicados corretamente
 * pela própria API (nunca recalculados aqui).
 */
async function fetchWindowSummaries(
  accountId: string,
  level: "account" | "campaign" | "adset" | "ad"
): Promise<{ windows: Record<PeriodKey, RawInsightRow[]>; droppedFields: string[] }> {
  const windows = {} as Record<PeriodKey, RawInsightRow[]>;
  const droppedFieldsSet = new Set<string>();

  for (const key of PERIOD_KEYS) {
    const { rows, droppedFields } = await fetchInsightsWithFallback(accountId, level, {
      date_preset: PERIOD_PRESETS[key],
    });
    windows[key] = rows;
    droppedFields.forEach((f) => droppedFieldsSet.add(f));
    await sleep(600);
  }

  return { windows, droppedFields: Array.from(droppedFieldsSet) };
}

export interface SyncResult {
  accountId: string;
  fetchedAt: string;
  counts: {
    campaigns: number;
    adsets: number;
    ads: number;
    insightsAccountRows: number;
    insightsCampaignRows: number;
  };
  droppedFields: Record<string, string[]>;
  dateRange: { start: string | null; stop: string | null };
}

export interface SyncOptions {
  /** Ignora qualquer cache salvo e busca tudo de novo na Graph API. */
  force?: boolean;
}

export async function syncAccount(accountId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const force = options.force ?? false;
  const fetchedAt = new Date().toISOString();
  const droppedFields: Record<string, string[]> = {};
  const rawKey = (name: string) => `raw:${accountId}:${name}`;

  const campaignsWrap = await cachedFetch(
    rawKey("campaigns"),
    async () => ({
      fetchedAt,
      accountId,
      data: await graphGetAllPages<CampaignEntity>(`/${accountId}/campaigns`, { fields: ENTITY_FIELDS.campaign, limit: "500" }),
    }),
    force
  );
  const campaigns = campaignsWrap.data;

  const adsetsWrap = await cachedFetch(
    rawKey("adsets"),
    async () => ({
      fetchedAt,
      accountId,
      data: await graphGetAllPages<AdSetEntity>(`/${accountId}/adsets`, { fields: ENTITY_FIELDS.adset, limit: "500" }),
    }),
    force
  );
  const adsets = adsetsWrap.data;

  const adsWrap = await cachedFetch(
    rawKey("ads"),
    async () => ({
      fetchedAt,
      accountId,
      data: await graphGetAllPages<AdEntity>(`/${accountId}/ads`, { fields: ENTITY_FIELDS.ad, limit: "500" }),
    }),
    force
  );
  const ads = adsWrap.data;

  // Status de verificação do negócio por trás da conta — relevante porque a
  // Meta bloqueia a criação de conjuntos/anúncios para negócios não
  // verificados (ou com verificação rejeitada), independente de permissões.
  await cachedFetch(
    rawKey("account-health"),
    async () => {
      const account = await graphGet<{ business?: { id?: string; name?: string } }>(`/${accountId}`, {
        fields: "business{id,name,verification_status}",
      });
      const business = account.business as (typeof account.business & { verification_status?: string }) | undefined;
      return {
        fetchedAt,
        accountId,
        data: {
          businessId: business?.id ?? null,
          businessName: business?.name ?? null,
          verificationStatus: business?.verification_status ?? null,
        },
      };
    },
    force
  );

  // Agregados nativos por período (hoje/ontem/3/7/14/30 dias/máximo), já
  // deduplicados pela própria Meta — usados para os KPIs "oficiais", tabelas
  // e motor de recomendação em qualquer período selecionado na dashboard.
  const accountWindowsWrap = await cachedFetch(
    rawKey("insights-account-windows"),
    async () => {
      const r = await fetchWindowSummaries(accountId, "account");
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.windows };
    },
    force
  );

  await cachedFetch(
    rawKey("insights-campaigns-windows"),
    async () => {
      const r = await fetchWindowSummaries(accountId, "campaign");
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.windows };
    },
    force
  );

  await cachedFetch(
    rawKey("insights-adsets-windows"),
    async () => {
      const r = await fetchWindowSummaries(accountId, "adset");
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.windows };
    },
    force
  );

  await cachedFetch(
    rawKey("insights-ads-windows"),
    async () => {
      const r = await fetchWindowSummaries(accountId, "ad");
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.windows };
    },
    force
  );

  const rangeRow = accountWindowsWrap.data.max[0];
  const historicalSince = rangeRow?.date_start ?? null;
  const until = rangeRow?.date_stop ?? null;

  if (!historicalSince || !until) {
    throw new Error("Não foi possível determinar o range de datas com dados para esta conta.");
  }

  // A série DIÁRIA (usada nos gráficos de evolução e na comparação de tendência
  // "período atual vs. anterior") cobre os últimos 60 dias, o suficiente para
  // comparar 30 dias atuais vs. 30 anteriores. Em contas com muito histórico e
  // alta fragmentação de action_types, pedir time_increment=1 desde o início da
  // conta nos níveis adset/ad fazia a Graph API retornar erro intermitente de
  // forma recorrente — por isso não buscamos série diária nesses dois níveis
  // (não usada nos gráficos; as tabelas usam os agregados por período acima).
  const sixtyDaysBefore = new Date(`${until}T00:00:00Z`);
  sixtyDaysBefore.setUTCDate(sixtyDaysBefore.getUTCDate() - 59);
  const sixtyDaysBeforeStr = sixtyDaysBefore.toISOString().slice(0, 10);
  const since = sixtyDaysBeforeStr > historicalSince ? sixtyDaysBeforeStr : historicalSince;

  const accountWrap = await cachedFetch(
    rawKey("insights-account"),
    async () => {
      const r = await fetchDailyInsightsChunked(accountId, "account", since, until);
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.rows };
    },
    force
  );
  droppedFields.account = accountWrap.droppedFields;

  const campaignInsightsWrap = await cachedFetch(
    rawKey("insights-campaigns"),
    async () => {
      const r = await fetchDailyInsightsChunked(accountId, "campaign", since, until);
      return { fetchedAt, accountId, droppedFields: r.droppedFields, data: r.rows };
    },
    force
  );
  droppedFields.campaign = campaignInsightsWrap.droppedFields;

  const dateRange = { start: since, stop: until };

  const result: SyncResult = {
    accountId,
    fetchedAt,
    counts: {
      campaigns: campaigns.length,
      adsets: adsets.length,
      ads: ads.length,
      insightsAccountRows: accountWrap.data.length,
      insightsCampaignRows: campaignInsightsWrap.data.length,
    },
    droppedFields,
    dateRange,
  };

  await setJson(rawKey("sync-meta"), result);
  return result;
}
