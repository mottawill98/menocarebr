import { Suspense } from "react";
import { getAccountInfo, getOverview, getCampaigns } from "@/lib/data";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import { AlertTriangle } from "lucide-react";

// Os dados vêm de arquivos locais atualizados pelo botão "Atualizar dados agora"
// (fora do ciclo de build) — nunca cachear/prerenderizar esta página.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const overview = await getOverview();

  if (!overview) {
    const account = await getAccountInfo();
    return (
      <EmptyState
        title="Esta conta ainda não foi sincronizada"
        message={`Clique em "Atualizar dados agora" no topo da página para buscar campanhas e insights de ${account.name} na Marketing API. A primeira sincronização pode levar alguns minutos.`}
      />
    );
  }

  const [account, campaigns] = await Promise.all([getAccountInfo(), getCampaigns()]);

  return (
    <Suspense>
      <OverviewDashboard overview={overview} campaigns={campaigns} currency={account.currency} />
    </Suspense>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-surface p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 text-status-warning" size={28} />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-secondary">{message}</p>
    </div>
  );
}
