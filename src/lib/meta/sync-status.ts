import { getJson, setJson } from "@/lib/db";

export interface SyncStatus {
  inProgress: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: { message: string; at: string } | null;
}

const DEFAULT_STATUS: SyncStatus = {
  inProgress: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
};

function statusKey(accountId: string): string {
  return `raw:${accountId}:sync-status`;
}

// Nenhuma sincronização observada até hoje passou disso — se "inProgress" ficar
// true por mais tempo que isso, é porque o processo anterior morreu (reinício
// do servidor, processo encerrado) sem conseguir registrar sucesso/erro. Sem
// esse limite, o botão "Atualizar dados agora" ficaria travado para sempre.
const STALE_IN_PROGRESS_MS = 30 * 60 * 1000;

export async function readSyncStatus(accountId: string): Promise<SyncStatus> {
  const stored = await getJson<Partial<SyncStatus>>(statusKey(accountId));
  if (!stored) return { ...DEFAULT_STATUS };
  const status: SyncStatus = { ...DEFAULT_STATUS, ...stored };

  if (status.inProgress && status.lastAttemptAt) {
    const elapsed = Date.now() - new Date(status.lastAttemptAt).getTime();
    if (elapsed > STALE_IN_PROGRESS_MS) {
      const recovered: SyncStatus = {
        ...status,
        inProgress: false,
        lastError: {
          message: "A sincronização anterior foi interrompida (servidor reiniciado ou processo encerrado) antes de terminar.",
          at: new Date().toISOString(),
        },
      };
      await writeSyncStatus(accountId, recovered);
      return recovered;
    }
  }

  return status;
}

function writeSyncStatus(accountId: string, status: SyncStatus): Promise<void> {
  return setJson(statusKey(accountId), status);
}

export async function markSyncStart(accountId: string): Promise<SyncStatus> {
  const next: SyncStatus = {
    ...(await readSyncStatus(accountId)),
    inProgress: true,
    lastAttemptAt: new Date().toISOString(),
  };
  await writeSyncStatus(accountId, next);
  return next;
}

export async function markSyncSuccess(accountId: string): Promise<SyncStatus> {
  const next: SyncStatus = {
    ...(await readSyncStatus(accountId)),
    inProgress: false,
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
  };
  await writeSyncStatus(accountId, next);
  return next;
}

/** Preserva lastSuccessAt anterior — dados válidos antigos continuam sendo "os dados atuais" até uma nova sincronização bem-sucedida. */
export async function markSyncError(accountId: string, message: string): Promise<SyncStatus> {
  const next: SyncStatus = {
    ...(await readSyncStatus(accountId)),
    inProgress: false,
    lastError: { message, at: new Date().toISOString() },
  };
  await writeSyncStatus(accountId, next);
  return next;
}
