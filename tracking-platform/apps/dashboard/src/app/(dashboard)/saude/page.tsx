import { requireRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

interface HealthResponse {
  status: string;
  checks: Record<string, unknown>;
  checked_at: string;
}

async function fetchWorkerHealth(): Promise<HealthResponse | { error: string }> {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) return { error: "WORKER_URL não configurado no dashboard." };

  try {
    const res = await fetch(`${workerUrl}/health`, { cache: "no-store" });
    return (await res.json()) as HealthResponse;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao consultar o Worker." };
  }
}

export default async function SaudePage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const health = await fetchWorkerHealth();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Saúde do sistema</h1>

      <Card>
        <CardHeader>
          <CardTitle>Worker (redirect, filas, webhooks)</CardTitle>
        </CardHeader>
        <CardContent>
          {"error" in health ? (
            <p className="text-sm text-danger">{health.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Status geral</span>
                <Badge tone={health.status === "ok" ? "success" : "warning"}>{health.status}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(health.checks).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <dt className="text-muted">{key}</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {typeof value === "boolean" ? (value ? "sim" : "não") : String(value ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted">Verificado em {formatDateTime(health.checked_at)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
