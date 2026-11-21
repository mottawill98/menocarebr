import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, formatPercent, safeDivide } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { ExportCsvButton } from "@/components/export-csv-button";
import { exportMetaEventsCsv } from "@/actions/export";
import { ResendButton } from "./resend-button";
import { TestEventButton } from "./test-event-button";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  sent: "success",
  pending: "neutral",
  processing: "warning",
  failed: "warning",
  dead_letter: "danger",
};

export default async function MetaCapiPage() {
  const profile = await getCurrentProfile();
  const canManage = profile?.role === "ADMIN" || profile?.role === "MANAGER";

  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase.from("meta_events").select("*").order("created_at", { ascending: false }).limit(200);

  const { data: orders } = await supabase.from("orders").select("id, crm_order_id, campaign_id:click_ref");
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const pending = (events ?? []).filter((e) => e.status === "pending" || e.status === "processing").length;
  const sent = (events ?? []).filter((e) => e.status === "sent").length;
  const failed = (events ?? []).filter((e) => e.status === "failed" || e.status === "dead_letter").length;
  const successRate = safeDivide(sent, sent + failed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Meta Conversions API</h1>
        <div className="flex items-center gap-2">
          <ExportCsvButton action={exportMetaEventsCsv} filename="meta-events.csv" />
          {canManage && <TestEventButton />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Pendentes" value={String(pending)} />
        <KpiCard label="Enviados" value={String(sent)} />
        <KpiCard label="Falhos" value={String(failed)} />
        <KpiCard label="Taxa de sucesso" value={formatPercent(successRate)} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Event ID</th>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2 text-right">Tentativas</th>
                <th className="px-4 py-2">HTTP</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Última tentativa</th>
                {canManage && <th className="px-4 py-2 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((event) => {
                const order = orderById.get(event.order_id);
                const value = (event.payload_sanitized as { data?: Array<{ custom_data?: { value?: number } }> })?.data?.[0]?.custom_data
                  ?.value;
                return (
                  <tr key={event.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-2 font-mono text-xs">{event.event_id}</td>
                    <td className="px-4 py-2">{order ? `#${order.crm_order_id}` : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{value !== undefined ? formatCurrency(value) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{event.attempts}</td>
                    <td className="px-4 py-2 tabular-nums text-muted">{event.http_status ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[event.status] ?? "neutral"}>{event.status}</Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(event.last_attempt_at)}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        {(event.status === "failed" || event.status === "dead_letter") && <ResendButton metaEventId={event.id} />}
                      </td>
                    )}
                  </tr>
                );
              })}
              {(events ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Nenhum evento ainda.
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
