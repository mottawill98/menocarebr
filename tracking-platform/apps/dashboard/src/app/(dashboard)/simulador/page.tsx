import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SimulatorPanel } from "./simulator-panel";

export default async function SimuladorPage() {
  await requireRole(["ADMIN"]);

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATOR_IN_PRODUCTION !== "true") {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: firstRoute } = await supabase.from("routes").select("slug").limit(1).maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Simulador de fluxo</h1>
        <p className="text-sm text-muted">
          Exercita clique → redirect → CRM (mensagem) → pedido → Meta CAPI usando os endpoints reais do Worker. Nunca disponível em
          produção.
        </p>
      </div>
      <SimulatorPanel defaultSlug={firstRoute?.slug ?? "menocare"} />
    </div>
  );
}
