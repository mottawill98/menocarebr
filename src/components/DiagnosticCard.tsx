import { Stethoscope, AlertTriangle, Rocket, ClipboardCheck } from "lucide-react";
import { RecommendationBadge } from "./RecommendationBadge";
import { formatMoney, formatNumber } from "@/lib/format";
import type { CampaignDiagnostic } from "@/lib/analysis/narrative";

export function DiagnosticCard({
  diagnostic,
  periodLabel,
  currency,
}: {
  diagnostic: CampaignDiagnostic;
  periodLabel: string;
  currency: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Diagnóstico do analista — {periodLabel}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Confiança: {diagnostic.confidence}</span>
          <RecommendationBadge action={diagnostic.action} />
        </div>
      </div>

      <div className="flex gap-2.5">
        <Stethoscope size={16} className="mt-0.5 shrink-0 text-series-1" />
        <div>
          <div className="text-xs font-semibold text-ink-muted">Diagnóstico</div>
          <p className="mt-0.5 text-sm text-ink-secondary">{diagnostic.diagnosis}</p>
        </div>
      </div>

      {diagnostic.problem && (
        <div className="flex gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-serious" />
          <div>
            <div className="text-xs font-semibold text-ink-muted">Problema identificado</div>
            <p className="mt-0.5 text-sm text-ink-secondary">{diagnostic.problem}</p>
          </div>
        </div>
      )}

      {diagnostic.opportunity && (
        <div className="flex gap-2.5">
          <Rocket size={16} className="mt-0.5 shrink-0 text-status-good" />
          <div>
            <div className="text-xs font-semibold text-ink-muted">Oportunidade identificada</div>
            <p className="mt-0.5 text-sm text-ink-secondary">{diagnostic.opportunity}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-series-4" />
        <div>
          <div className="text-xs font-semibold text-ink-muted">Recomendação</div>
          <p className="mt-0.5 text-sm text-ink-secondary">{diagnostic.recommendationText}</p>
          {diagnostic.impact && (
            <p className="mt-1 text-xs font-medium text-series-1">
              Impacto estimado:{" "}
              {diagnostic.impact.kind === "volume_incremental"
                ? `~${formatNumber(diagnostic.impact.value, 0)} conversões adicionais`
                : formatMoney(diagnostic.impact.value, currency)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
