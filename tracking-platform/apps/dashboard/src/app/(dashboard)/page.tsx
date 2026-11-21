import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, previousPeriod, type DateRangePreset } from "@/lib/date-range";
import { computeOverviewMetrics, fetchClickFunnelRows } from "@/lib/queries/overview";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; erro?: string }>;
}) {
  const { range: rangeParam, erro } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "7d";
  const range = resolveDateRange(preset);
  const previous = previousPeriod(range);

  const supabase = await createSupabaseServerClient();
  const [currentRows, previousRows] = await Promise.all([
    fetchClickFunnelRows(supabase, range),
    fetchClickFunnelRows(supabase, previous),
  ]);

  const metrics = computeOverviewMetrics(currentRows);
  const previousMetrics = computeOverviewMetrics(previousRows);

  const delta = (curr: number, prev: number) => (prev ? (curr - prev) / prev : null);

  const { data: metaCounts } = await supabase.from("meta_events").select("status");
  const sentCount = metaCounts?.filter((e) => e.status === "sent").length ?? 0;
  const failedCount = metaCounts?.filter((e) => e.status === "failed" || e.status === "dead_letter").length ?? 0;

  return (
    <div className="space-y-6">
      {erro === "sem-permissao" && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          Você não tem permissão para acessar essa página.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Visão geral</h1>
          <p className="text-sm text-muted">Cliques → leads identificados → pedidos → compras</p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Cliques" value={formatNumber(metrics.clicks)} delta={delta(metrics.clicks, previousMetrics.clicks)} />
        <KpiCard label="Leads identificados" value={formatNumber(metrics.leads)} delta={delta(metrics.leads, previousMetrics.leads)} />
        <KpiCard label="Pedidos" value={formatNumber(metrics.orders)} delta={delta(metrics.orders, previousMetrics.orders)} />
        <KpiCard label="Compras" value={formatNumber(metrics.purchases)} delta={delta(metrics.purchases, previousMetrics.purchases)} />
        <KpiCard label="Faturamento" value={formatCurrency(metrics.revenue)} delta={delta(metrics.revenue, previousMetrics.revenue)} />
        <KpiCard label="Ticket médio" value={formatCurrency(metrics.averageTicket)} />
        <KpiCard label="Clique → Lead" value={formatPercent(metrics.clickToLead)} hint="Cobertura de tracking (item 63)" />
        <KpiCard label="Lead → Compra" value={formatPercent(metrics.leadToPurchase)} />
        <KpiCard label="Clique → Compra" value={formatPercent(metrics.clickToPurchase)} />
        <KpiCard label="Eventos Meta enviados" value={formatNumber(sentCount)} />
        <KpiCard label="Eventos Meta com erro" value={formatNumber(failedCount)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nomenclatura importante</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Um <strong>clique/redirect</strong> não é o mesmo que um <strong>lead</strong>. Só chamamos de lead quando o CRM
          confirma que a mensagem com o <code>#click_ref</code> chegou (item 61). Um clique sem lead correspondente pode
          significar que a pessoa apagou o código antes de enviar a mensagem.
        </CardContent>
      </Card>
    </div>
  );
}
