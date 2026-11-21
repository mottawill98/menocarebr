import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { computeFunnelSteps, computeOverviewMetrics, fetchClickFunnelRows } from "@/lib/queries/overview";
import { formatNumber, formatPercent, safeDivide } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";

export default async function FunilPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "7d";
  const range = resolveDateRange(preset);

  const supabase = await createSupabaseServerClient();
  const rows = await fetchClickFunnelRows(supabase, range);
  const metrics = computeOverviewMetrics(rows);
  const steps = computeFunnelSteps(metrics);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Funil</h1>
          <p className="text-sm text-muted">Conversão etapa a etapa — redirect ≠ lead (item 61)</p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      <Card>
        <CardContent className="space-y-3">
          {steps.map((step, idx) => {
            const previous = steps[idx - 1];
            const widthPct = steps[0]!.value ? Math.max(4, (step.value / steps[0]!.value) * 100) : 0;
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{step.label}</span>
                  <span className="tabular-nums text-muted">
                    {formatNumber(step.value)}
                    {previous && <> · {formatPercent(safeDivide(step.value, previous.value))} da etapa anterior</>}
                  </span>
                </div>
                <div className="mt-1 h-3 rounded-full bg-background">
                  <div className="h-3 rounded-full bg-brand" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
