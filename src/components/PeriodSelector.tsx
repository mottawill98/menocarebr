"use client";

import { usePeriod } from "@/lib/use-period";
import { PERIOD_KEYS, PERIOD_LABELS } from "@/lib/periods";

export function PeriodSelector() {
  const [period, setPeriod] = usePeriod();

  return (
    <select
      value={period}
      onChange={(e) => setPeriod(e.target.value as typeof period)}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink"
      aria-label="Período de análise"
    >
      {PERIOD_KEYS.map((key) => (
        <option key={key} value={key}>
          {PERIOD_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
