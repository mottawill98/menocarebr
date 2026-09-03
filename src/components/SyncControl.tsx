"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, TriangleAlert } from "lucide-react";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_LABELS } from "@/lib/periods";
import type { AccountInfo } from "@/lib/data";
import type { SyncStatus } from "@/lib/meta/sync-status";

function formatDateTime(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR");
}

export function SyncControl({
  accountInfo,
  initialStatus,
}: {
  accountInfo: AccountInfo;
  initialStatus: SyncStatus;
}) {
  const router = useRouter();
  const [period] = usePeriod();
  const [status, setStatus] = useState(initialStatus);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      if (json.status) setStatus(json.status);
      if (json.ok) {
        router.refresh();
      }
    } catch {
      setStatus((s) => ({
        ...s,
        inProgress: false,
        lastError: { message: "Falha de rede ao tentar sincronizar.", at: new Date().toISOString() },
      }));
    } finally {
      setSyncing(false);
    }
  }

  const busy = syncing || status.inProgress;
  const showErrorBanner =
    !!status.lastError && (!status.lastSuccessAt || status.lastError.at > status.lastSuccessAt);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="text-right leading-tight">
          <div className="text-sm font-medium text-ink">{accountInfo.name}</div>
          <div className="text-xs text-ink-muted">
            ID {accountInfo.numericId} · Período: {PERIOD_LABELS[period]}
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-page disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {busy ? "Atualizando..." : "Atualizar dados agora"}
        </button>
      </div>
      <div className="text-xs text-ink-muted">
        Última sincronização bem-sucedida: {formatDateTime(status.lastSuccessAt)}
      </div>
      {busy && (
        <div className="text-xs text-ink-muted">Isso pode levar alguns minutos em contas com muito histórico.</div>
      )}
      {!busy && showErrorBanner && (
        <div className="flex max-w-sm items-start gap-2 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Falha na última atualização ({formatDateTime(status.lastError!.at)}): {status.lastError!.message} Exibindo
            dados em cache da última sincronização bem-sucedida.
          </span>
        </div>
      )}
    </div>
  );
}
