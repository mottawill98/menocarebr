import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { computeCampaignTable, fetchClickFunnelRows } from "@/lib/queries/overview";
import { formatCurrency, formatNumber, formatPercent, safeDivide } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; campaign_id?: string; adset_id?: string }>;
}) {
  const { range: rangeParam, campaign_id, adset_id } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "30d";
  const range = resolveDateRange(preset);

  const supabase = await createSupabaseServerClient();
  let rows = await fetchClickFunnelRows(supabase, range);

  let level: "campaign" | "adset" | "ad" = "campaign";
  if (campaign_id) {
    rows = rows.filter((r) => r.campaign_id === campaign_id);
    level = "adset";
  }
  if (adset_id) {
    rows = rows.filter((r) => r.adset_id === adset_id);
    level = "ad";
  }

  const table = computeCampaignTable(rows, level).sort((a, b) => b.clicks - a.clicks);

  const nameFor = (row: (typeof table)[number]) =>
    level === "campaign" ? row.campaign_name || row.key : level === "adset" ? row.adset_name || row.key : row.ad_name || row.key;

  const drillHref = (row: (typeof table)[number]) => {
    if (level === "campaign") {
      const params = new URLSearchParams({ range: preset, campaign_id: row.campaign_id ?? row.key });
      return `?${params.toString()}`;
    }
    if (level === "adset") {
      const params = new URLSearchParams({ range: preset, campaign_id: campaign_id!, adset_id: row.adset_id ?? row.key });
      return `?${params.toString()}`;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Campanhas</h1>
          <nav className="text-sm text-muted">
            <Link href={`?range=${preset}`} className="hover:text-foreground">
              Campanhas
            </Link>
            {campaign_id && <span> / Conjuntos</span>}
            {adset_id && <span> / Anúncios</span>}
          </nav>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">{level === "campaign" ? "Campanha" : level === "adset" ? "Conjunto" : "Anúncio"}</th>
                <th className="px-4 py-2 text-right">Cliques</th>
                <th className="px-4 py-2 text-right">Leads</th>
                <th className="px-4 py-2 text-right">Compras</th>
                <th className="px-4 py-2 text-right">Receita</th>
                <th className="px-4 py-2 text-right">Click→Lead</th>
                <th className="px-4 py-2 text-right">Click→Compra</th>
                <th className="px-4 py-2 text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => {
                const href = drillHref(row);
                return (
                  <tr key={row.key} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-2 font-medium text-foreground">
                      {href ? (
                        <Link href={href} className="text-brand hover:underline">
                          {nameFor(row)}
                        </Link>
                      ) : (
                        nameFor(row)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.leads)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.purchases)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPercent(safeDivide(row.leads, row.clicks))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPercent(safeDivide(row.purchases, row.clicks))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(safeDivide(row.revenue, row.purchases))}</td>
                  </tr>
                );
              })}
              {table.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Nenhum dado no período selecionado.
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
