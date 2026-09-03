import Link from "next/link";
import { RecommendationBadge } from "./RecommendationBadge";
import { formatMoney, formatNumber } from "@/lib/format";
import type { TopAction } from "@/lib/analysis/narrative";

export function TopActionsPanel({ actions, currency }: { actions: TopAction[]; currency: string }) {
  if (!actions.length) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-base font-semibold text-ink">Top 5 ações recomendadas</h2>
        <p className="text-sm text-ink-muted">Nenhuma ação de alto impacto identificada neste período.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-ink">Top 5 ações recomendadas</h2>
      <ol className="space-y-3">
        {actions.map((a, i) => (
          <li key={a.campaignId} className="flex items-start gap-3 rounded-lg border border-border p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-page text-xs font-semibold text-ink-secondary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/campaigns/${a.campaignId}`} className="truncate text-sm font-medium text-ink hover:underline">
                  {a.campaignName}
                </Link>
                <RecommendationBadge action={a.action} />
              </div>
              <p className="mt-1 text-sm text-ink-secondary">{a.recommendationText}</p>
              {a.impact && (
                <p className="mt-1 text-xs font-medium text-series-1">
                  Impacto estimado:{" "}
                  {a.impact.kind === "volume_incremental"
                    ? `~${formatNumber(a.impact.value, 0)} conversões adicionais`
                    : formatMoney(a.impact.value, currency)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
