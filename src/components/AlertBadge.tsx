import { Info, TriangleAlert, CircleAlert } from "lucide-react";
import type { Alert } from "@/lib/analysis/recommendation";

const SEVERITY_CONFIG: Record<Alert["severity"], { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: "text-series-1 bg-series-1/10", label: "Info" },
  atencao: { icon: TriangleAlert, className: "text-status-warning bg-status-warning/15", label: "Atenção" },
  critico: { icon: CircleAlert, className: "text-status-critical bg-status-critical/10", label: "Crítico" },
};

export function AlertBadgeRow({ alert }: { alert: Alert }) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${cfg.className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" strokeWidth={2.25} />
      <span className="text-ink">{alert.message}</span>
    </div>
  );
}
