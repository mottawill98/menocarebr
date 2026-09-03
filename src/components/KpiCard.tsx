export function KpiCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  const isNA = value === "N/A";
  return (
    <div className="rounded-xl border border-border bg-surface p-4 min-w-0">
      <div className="truncate text-xs font-medium text-ink-muted">{label}</div>
      <div
        className={`mt-1.5 truncate text-lg font-semibold tabular sm:text-xl ${isNA ? "text-ink-muted" : "text-ink"}`}
        title={value}
      >
        {value}
      </div>
      {sublabel && <div className="mt-1 truncate text-xs text-ink-secondary">{sublabel}</div>}
    </div>
  );
}
