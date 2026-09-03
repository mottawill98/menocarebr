import { TrendingUp, Check, Eye, TrendingDown, OctagonPause } from "lucide-react";
import type { RecommendationAction } from "@/lib/analysis/recommendation";

const CONFIG: Record<
  RecommendationAction,
  { label: string; icon: typeof TrendingUp; className: string }
> = {
  ESCALAR: { label: "ESCALAR", icon: TrendingUp, className: "bg-status-good/10 text-status-good" },
  MANTER: { label: "MANTER", icon: Check, className: "bg-series-1/10 text-series-1" },
  OBSERVAR: { label: "OBSERVAR", icon: Eye, className: "bg-status-warning/15 text-ink-secondary" },
  REDUZIR: { label: "REDUZIR", icon: TrendingDown, className: "bg-status-serious/10 text-status-serious" },
  PAUSAR: { label: "PAUSAR", icon: OctagonPause, className: "bg-status-critical/10 text-status-critical" },
};

export function RecommendationBadge({ action }: { action: RecommendationAction }) {
  const cfg = CONFIG[action];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.className}`}>
      <Icon size={13} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}
