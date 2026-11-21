import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { exportOrdersCsv } from "@/actions/export";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; attribution?: string }>;
}) {
  const { range: rangeParam, attribution } = await searchParams;
  const preset = (rangeParam as DateRangePreset) || "30d";
  const range = resolveDateRange(preset);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("orders")
    .select("*")
    .gte("ordered_at", range.from.toISOString())
    .lte("ordered_at", range.to.toISOString())
    .order("ordered_at", { ascending: false })
    .limit(200);

  if (attribution === "attributed") query = query.eq("attribution_status", "attributed");
  if (attribution === "unmatched") query = query.eq("attribution_status", "unmatched");

  const { data: orders } = await query;

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: metaEvents } = orderIds.length ? await supabase.from("meta_events").select("order_id, status").in("order_id", orderIds) : { data: [] };
  const metaStatusByOrder = new Map((metaEvents ?? []).map((e) => [e.order_id, e.status]));

  const boundExport = exportOrdersCsv.bind(null, range);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
          <div className="mt-2 flex gap-2 text-xs">
            <FilterLink label="Todos" active={!attribution} params={{ range: preset }} />
            <FilterLink label="Atribuídos" active={attribution === "attributed"} params={{ range: preset, attribution: "attributed" }} />
            <FilterLink label="Sem atribuição" active={attribution === "unmatched"} params={{ range: preset, attribution: "unmatched" }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter current={preset} />
          <ExportCsvButton action={boundExport} filename="pedidos.csv" />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Telefone</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Atribuição</th>
                <th className="px-4 py-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-2 font-medium text-foreground">#{order.crm_order_id}</td>
                  <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(order.ordered_at)}</td>
                  <td className="px-4 py-2 font-mono">{order.phone_last4 ? `•••• ${order.phone_last4}` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(order.value, order.currency)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={order.status === "paid" || order.status === "approved" ? "success" : "neutral"}>{order.status}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={order.attribution_status === "attributed" ? "info" : "warning"}>
                      {order.attribution_status === "attributed" ? order.attribution_method : "unmatched"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {metaStatusByOrder.has(order.id) ? (
                      <Badge tone={metaStatusByOrder.get(order.id) === "sent" ? "success" : "danger"}>{metaStatusByOrder.get(order.id)}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(orders ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Nenhum pedido no período selecionado.
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

function FilterLink({ label, active, params }: { label: string; active: boolean; params: Record<string, string> }) {
  const query = new URLSearchParams(params).toString();
  return (
    <a
      href={`?${query}`}
      className={active ? "rounded-full bg-brand px-2 py-1 text-brand-foreground" : "rounded-full px-2 py-1 text-muted hover:text-foreground"}
    >
      {label}
    </a>
  );
}
