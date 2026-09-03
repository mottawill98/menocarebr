import { NextResponse } from "next/server";
import { AD_ACCOUNT_ID } from "@/lib/config";
import { runFullSync } from "@/lib/sync-orchestrator";
import { readSyncStatus } from "@/lib/meta/sync-status";

export async function GET() {
  return NextResponse.json({ status: await readSyncStatus(AD_ACCOUNT_ID) });
}

/**
 * Dispara uma sincronização completa (busca + processamento) para a conta
 * fixa da aplicação. Sempre busca dados novos na Marketing API (force),
 * nunca reaproveita uma sincronização anterior como se fosse atual. Somente
 * leitura na Marketing API — nenhuma chamada de escrita é feita.
 */
export async function POST() {
  const result = await runFullSync(AD_ACCOUNT_ID, { force: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
