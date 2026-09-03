import fs from "node:fs";
import path from "node:path";
import { graphGet, graphGetAllPages } from "./client";
import type { AdAccountInfo } from "./types";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

export interface DiscoverResult {
  fetchedAt: string;
  me: { id: string; name?: string };
  accounts: AdAccountInfo[];
}

/** Valida o token e lista as contas de anúncio acessíveis, salvando o resultado em data/raw/accounts.json. */
export async function discoverAccounts(): Promise<DiscoverResult> {
  const me = await graphGet<{ id: string; name?: string }>("/me", { fields: "id,name" });

  const accounts = await graphGetAllPages<AdAccountInfo>("/me/adaccounts", {
    fields: "id,account_id,name,account_status,currency,timezone_name,amount_spent,business_name",
    limit: "200",
  });

  const result: DiscoverResult = { fetchedAt: new Date().toISOString(), me, accounts };

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(path.join(RAW_DIR, "accounts.json"), JSON.stringify(result, null, 2));

  return result;
}

export function readCachedAccounts(): DiscoverResult | null {
  const p = path.join(RAW_DIR, "accounts.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
