import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function WebhooksPage() {
  await requireRole(["ADMIN"]);
  const supabase = await createSupabaseServerClient();
  const { data: logs } = await supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Webhook logs</h1>
        <p className="text-sm text-muted">Página técnica (ADMIN). Payload sempre sanitizado — nunca mostra token/segredo.</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Horário</th>
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2">request_id</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Duração</th>
                <th className="px-4 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-background align-top">
                  <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{log.endpoint}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{log.request_id}</td>
                  <td className="px-4 py-2">
                    <Badge tone={log.status < 300 ? "success" : log.status < 500 ? "warning" : "danger"}>{log.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{log.duration_ms}ms</td>
                  <td className="px-4 py-2">
                    <p className="max-w-md truncate text-xs text-muted" title={log.result}>
                      {log.result}
                    </p>
                    {log.error_message && <p className="text-xs text-danger">{log.error_message}</p>}
                  </td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Nenhum log ainda.
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
