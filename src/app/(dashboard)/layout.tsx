import { Suspense } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { SyncControl } from "@/components/SyncControl";
import { getAccountInfo, getSyncStatus } from "@/lib/data";

// Os dados de conta/status de sync vêm de arquivos locais/banco atualizados
// pelo botão "Atualizar dados agora" (fora do ciclo de build) — nunca
// cachear/prerenderizar o shell do dashboard.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const accountInfo = await getAccountInfo();
  const syncStatus = await getSyncStatus();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
              <BarChart3 size={20} className="text-series-1" />
              Meta Ads Dashboard
            </Link>
            <nav className="flex items-center gap-4 text-sm text-ink-secondary">
              <Link href="/" className="hover:text-ink">
                Visão geral
              </Link>
              <Link href="/campaigns" className="hover:text-ink">
                Campanhas
              </Link>
              <Link href="/creatives" className="hover:text-ink">
                Criativos
              </Link>
              <Link href="/plan" className="hover:text-ink">
                Plano de ação
              </Link>
              <Link href="/whatsapp" className="hover:text-ink">
                WhatsApp
              </Link>
            </nav>
          </div>
          <Suspense fallback={<div className="h-9 w-64" />}>
            <SyncControl accountInfo={accountInfo} initialStatus={syncStatus} />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-ink-muted sm:px-6">
        Aplicação somente leitura — nenhuma chamada de escrita é feita à Marketing API da Meta.
      </footer>
    </>
  );
}
