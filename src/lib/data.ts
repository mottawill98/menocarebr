import { AD_ACCOUNT_ID } from "./config";
import { getJson } from "./db";
import type { ProcessedOverview, ProcessedCampaign, ProcessedAdSet, ProcessedAd } from "./analysis/process";
import type { SyncResult } from "./meta/sync";
import { readSyncStatus, type SyncStatus } from "./meta/sync-status";

export interface AccountInfo {
  id: string;
  numericId: string;
  name: string;
  currency: string;
  accountStatus: number | null;
  businessName?: string;
}

interface CachedAccountsFile {
  accounts?: Array<{
    id: string;
    account_id: string;
    name: string;
    currency?: string;
    account_status?: number;
    business_name?: string;
  }>;
}

/** Lê os metadados da conta fixa (nome, moeda, etc.) do cache de contas salvo na descoberta. */
export async function getAccountInfo(): Promise<AccountInfo> {
  const cached = await getJson<CachedAccountsFile>("raw:accounts");
  const match = cached?.accounts?.find((a) => a.id === AD_ACCOUNT_ID);
  if (match) {
    return {
      id: match.id,
      numericId: match.account_id,
      name: match.name,
      currency: match.currency ?? "BRL",
      accountStatus: match.account_status ?? null,
      businessName: match.business_name,
    };
  }
  return { id: AD_ACCOUNT_ID, numericId: AD_ACCOUNT_ID.replace(/^act_/, ""), name: AD_ACCOUNT_ID, currency: "BRL", accountStatus: null };
}

function readProcessed<T>(key: string): Promise<T | null> {
  return getJson<T>(`processed:${AD_ACCOUNT_ID}:${key}`);
}

export async function getOverview(): Promise<ProcessedOverview | null> {
  return readProcessed<ProcessedOverview>("overview");
}

export async function getCampaigns(): Promise<ProcessedCampaign[]> {
  return (await readProcessed<ProcessedCampaign[]>("campaigns")) ?? [];
}

export async function getAdSets(): Promise<ProcessedAdSet[]> {
  return (await readProcessed<ProcessedAdSet[]>("adsets")) ?? [];
}

export async function getAds(): Promise<ProcessedAd[]> {
  return (await readProcessed<ProcessedAd[]>("ads")) ?? [];
}

export async function getCampaignDetail(campaignId: string) {
  const [campaigns, adsets, ads] = await Promise.all([getCampaigns(), getAdSets(), getAds()]);
  return {
    campaign: campaigns.find((c) => c.id === campaignId) ?? null,
    adsets: adsets.filter((a) => a.campaignId === campaignId),
    ads: ads.filter((a) => a.campaignId === campaignId),
  };
}

export async function getSyncMeta(): Promise<SyncResult | null> {
  return getJson<SyncResult>(`raw:${AD_ACCOUNT_ID}:sync-meta`);
}

/**
 * Status de sincronização, com fallback para `overview.fetchedAt` quando o
 * status ainda não existe (ex.: dados processados antes deste rastreamento
 * existir) — evita mostrar "nunca" quando já há dados válidos.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const status = await readSyncStatus(AD_ACCOUNT_ID);
  if (status.lastSuccessAt === null) {
    const overview = await getOverview();
    if (overview) {
      return { ...status, lastSuccessAt: overview.fetchedAt };
    }
  }
  return status;
}
