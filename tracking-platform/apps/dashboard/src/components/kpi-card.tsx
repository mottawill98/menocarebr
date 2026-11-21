import { Card } from "./ui/card";
import { clsx } from "clsx";

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
}

export function KpiCard({ label, value, delta, deltaLabel = "vs. período anterior", hint }: KpiCardProps) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={clsx("mt-1 text-xs font-medium", delta >= 0 ? "text-success" : "text-danger")}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% <span className="font-normal text-muted">{deltaLabel}</span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
