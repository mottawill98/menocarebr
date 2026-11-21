import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "./settings-form";

export default async function ConfiguracoesPage() {
  await requireRole(["ADMIN"]);
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Integrações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <IntegrationStatus label="Meta configurada" ok={Boolean(process.env.META_ACCESS_TOKEN && process.env.META_DATASET_ID)} />
          <IntegrationStatus label="Dataset configurado" ok={Boolean(process.env.META_DATASET_ID)} />
          <IntegrationStatus label="Modo teste" ok={Boolean(process.env.META_TEST_EVENT_CODE)} />
          <IntegrationStatus label="Worker configurado" ok={Boolean(process.env.WORKER_URL)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferências</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm initial={settings} />
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{label}</span>
      <Badge tone={ok ? "success" : "neutral"}>{ok ? "SIM" : "NÃO"}</Badge>
    </div>
  );
}
