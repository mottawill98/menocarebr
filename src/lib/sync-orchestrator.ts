import { syncAccount } from "./meta/sync";
import { MetaGraphError } from "./meta/client";
import { processAccount, type ProcessedOverview } from "./analysis/process";
import { markSyncStart, markSyncSuccess, markSyncError, readSyncStatus, type SyncStatus } from "./meta/sync-status";

export interface SyncRunResult {
  ok: boolean;
  status: SyncStatus;
  overview?: ProcessedOverview;
  error?: string;
}

function friendlyErrorMessage(err: unknown): string {
  if (err instanceof MetaGraphError) {
    const meta = err.payload?.error;
    if (meta?.code === 190) {
      return "O token de acesso da Meta expirou ou é inválido. Gere um novo token e atualize META_ACCESS_TOKEN em .env.local, depois reinicie o servidor.";
    }
    if (meta?.code === 17 || meta?.code === 4 || meta?.code === 32 || meta?.code === 613) {
      return "A Meta limitou temporariamente o número de chamadas para esta conta (rate limit). Aguarde alguns minutos e tente novamente.";
    }
    if (meta?.code === 2 || meta?.error_subcode === 1504043 || meta?.error_subcode === 1504044) {
      return "A Meta retornou um erro intermitente ao processar a consulta. Tente novamente em instantes.";
    }
    return meta?.message
      ? `A Marketing API retornou um erro: ${meta.message}`
      : "A Marketing API retornou um erro inesperado.";
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Erro inesperado ao sincronizar com a Meta.";
}

/**
 * Roda uma sincronização completa (busca + processamento) e mantém o status
 * (última tentativa/sucesso/erro) sempre atualizado. Em caso de falha, os
 * dados processados anteriores (data/processed/) permanecem intactos — nunca
 * sobrescrevemos com uma sincronização parcial ou malsucedida.
 */
export async function runFullSync(accountId: string, opts: { force?: boolean } = {}): Promise<SyncRunResult> {
  const before = await readSyncStatus(accountId);
  if (before.inProgress) {
    return { ok: false, status: before, error: "Já existe uma sincronização em andamento para esta conta." };
  }

  await markSyncStart(accountId);
  try {
    await syncAccount(accountId, { force: opts.force ?? true });
    const overview = await processAccount(accountId);
    const status = await markSyncSuccess(accountId);
    return { ok: true, status, overview };
  } catch (err) {
    const message = friendlyErrorMessage(err);
    const status = await markSyncError(accountId, message);
    return { ok: false, status, error: message };
  }
}
