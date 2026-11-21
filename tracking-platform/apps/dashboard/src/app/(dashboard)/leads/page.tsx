import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { formatDateTime } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { exportLeadsCsv } from "@/actions/export";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "7d";
  const range = resolveDateRange(preset);

  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase
    .from("lead_bindings")
    .select("*")
    .gte("bound_at", range.from.toISOString())
    .lte("bound_at", range.to.toISOString())
    .order("bound_at", { ascending: false })
    .limit(200);

  const clickIds = (leads ?? []).map((l) => l.click_id);
  const { data: clicks } = clickIds.length ? await supabase.from("clicks").select("*").in("id", clickIds) : { data: [] };
  const clickById = new Map((clicks ?? []).map((c) => [c.id, c]));

  const orderClickIds = (clicks ?? []).map((c) => c.id);
  const { data: orders } = orderClickIds.length
    ? await supabase.from("orders").select("click_id, status").in("click_id", orderClickIds)
    : { data: [] };
  const hasOrderByClickId = new Set((orders ?? []).map((o) => o.click_id));

  const boundExport = exportLeadsCsv.bind(null, range);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Leads</h1>
        <div className="flex items-center gap-2">
          <DateRangeFilter current={preset} />
          <ExportCsvButton action={boundExport} filename="leads.csv" />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Horário</th>
                <th className="px-4 py-2">Últimos 4 dígitos</th>
                <th className="px-4 py-2">click_ref</th>
                <th className="px-4 py-2">Campanha</th>
                <th className="px-4 py-2">Anúncio</th>
                <th className="px-4 py-2">Pedido?</th>
              </tr>
            </thead>
            <tbody>
              {(leads ?? []).map((lead) => {
                const click = clickById.get(lead.click_id);
                return (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(lead.bound_at)}</td>
                    <td className="px-4 py-2 font-mono">•••• {lead.phone_last4}</td>
                    <td className="px-4 py-2 font-mono text-xs">{lead.click_ref}</td>
                    <td className="px-4 py-2">{click?.campaign_name || "—"}</td>
                    <td className="px-4 py-2">{click?.ad_name || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone={hasOrderByClickId.has(lead.click_id) ? "success" : "neutral"}>
                        {hasOrderByClickId.has(lead.click_id) ? "Sim" : "Não"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {(leads ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Nenhum lead no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
