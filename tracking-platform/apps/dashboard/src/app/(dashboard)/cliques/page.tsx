import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { formatDateTime } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { exportClicksCsv } from "@/actions/export";

export default async function CliquesPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "ADMIN";

  const { range: rangeParam } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "7d";
  const range = resolveDateRange(preset);

  const supabase = await createSupabaseServerClient();
  const { data: clicks } = await supabase
    .from("clicks")
    .select("*")
    .gte("clicked_at", range.from.toISOString())
    .lte("clicked_at", range.to.toISOString())
    .order("clicked_at", { ascending: false })
    .limit(200);

  const { data: numbers } = await supabase.from("whatsapp_numbers").select("id, label");
  const numberLabel = new Map((numbers ?? []).map((n) => [n.id, n.label]));

  const boundExport = exportClicksCsv.bind(null, range);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Cliques</h1>
        <div className="flex items-center gap-2">
          <DateRangeFilter current={preset} />
          <ExportCsvButton action={boundExport} filename="cliques.csv" />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Horário</th>
                <th className="px-4 py-2">click_ref</th>
                <th className="px-4 py-2">Campanha</th>
                <th className="px-4 py-2">Anúncio</th>
                <th className="px-4 py-2">Número</th>
                <th className="px-4 py-2">Lead?</th>
                {isAdmin && <th className="px-4 py-2">IP</th>}
              </tr>
            </thead>
            <tbody>
              {(clicks ?? []).map((click) => (
                <tr key={click.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(click.clicked_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{click.click_ref}</td>
                  <td className="px-4 py-2">{click.campaign_name || "—"}</td>
                  <td className="px-4 py-2">{click.ad_name || "—"}</td>
                  <td className="px-4 py-2">{numberLabel.get(click.whatsapp_number_id) || "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={click.lead_bound ? "success" : "neutral"}>{click.lead_bound ? "Sim" : "Não"}</Badge>
                  </td>
                  {isAdmin && <td className="px-4 py-2 font-mono text-xs text-muted">{click.client_ip_address || "—"}</td>}
                </tr>
              ))}
              {(clicks ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Nenhum clique no período selecionado.
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
