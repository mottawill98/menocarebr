import { promises as fs } from "node:fs";
import path from "node:path";

/** Gasto e métricas do Meta por criativo (planilha "valor gasto"). */
export interface LeadsRoiSpend {
  spend: number;
  impressions: number;
  linkClicks: number;
  conversations: number;
}

export interface LeadsRoiAd {
  key: string;
  name: string;
  /** Nomes originais somados neste anúncio. */
  variants: string[];
  campaignCount: number;
  campaigns: string[];
  spend: LeadsRoiSpend | null;
}

export interface LeadsRoiCampaign {
  key: string;
  name: string;
  /** Custo da campanha vindo da planilha do Meta (repartido pelos leads quando mais de um nome do CRM aponta para a mesma linha). */
  spend: LeadsRoiSpend | null;
}

/** [índice do anúncio, índice da campanha, dia "YYYY-MM-DD" ("" = sem data), leads, vendas, receita, inadimplentes, valor inadimplente] */
export type LeadsRoiRow = [number, number, string, number, number, number, number, number];

export interface LeadsRoiData {
  generatedAt: string;
  sources: {
    leadsRows: number;
    spendTotal: number;
    campaignSpendTotal: number;
    inadCount: number;
    inadValueTotal: number;
    inadMatchedLead: number;
    inadMatchedPaid: number;
    inadUnattributed: number;
    paidRows: number;
    salesCount: number;
    salesWithoutValue: number;
    excludedNotPaid: number;
    leadsRange: [string, string];
    paidRange: [string, string];
  };
  ads: LeadsRoiAd[];
  campaigns: LeadsRoiCampaign[];
  rows: LeadsRoiRow[];
}

const FILE = path.join(process.cwd(), "data", "leads-roi", "aggregated.json");

/** Lê o agregado gerado por `scripts/build-leads-roi.ts`; null se ainda não existir. */
export async function getLeadsRoiData(): Promise<LeadsRoiData | null> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as LeadsRoiData;
  } catch {
    return null;
  }
}
