import { Sparkles, TrendingDown, TrendingUp, Flame, Rocket, AlertOctagon, Stethoscope } from "lucide-react";
import type { ExecutiveSummary } from "@/lib/analysis/narrative";

const ROWS: { key: keyof ExecutiveSummary; label: string; icon: typeof Sparkles }[] = [
  { key: "whatsWorking", label: "O que está funcionando?", icon: Sparkles },
  { key: "whatWorsened", label: "O que piorou?", icon: TrendingDown },
  { key: "whatImproved", label: "O que melhorou?", icon: TrendingUp },
  { key: "whereWastingMoney", label: "Onde estou desperdiçando dinheiro?", icon: Flame },
  { key: "whereToScale", label: "Onde existe oportunidade de escala?", icon: Rocket },
  { key: "urgentCampaign", label: "Qual campanha merece atenção imediata?", icon: AlertOctagon },
  { key: "mainProblem", label: "Qual é o principal problema da conta hoje?", icon: Stethoscope },
];

export function ExecutiveSummaryPanel({ summary }: { summary: ExecutiveSummary }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-ink">Resumo executivo</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {ROWS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex gap-3">
            <Icon size={16} className="mt-0.5 shrink-0 text-series-1" />
            <div>
              <div className="text-xs font-semibold text-ink-muted">{label}</div>
              <p className="mt-0.5 text-sm text-ink">{summary[key]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
