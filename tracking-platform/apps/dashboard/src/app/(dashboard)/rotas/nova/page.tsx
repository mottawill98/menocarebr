import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteForm } from "../route-form";

export default async function NovaRotaPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const supabase = await createSupabaseServerClient();
  const { data: numbers } = await supabase.from("whatsapp_numbers").select("*").order("label");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Nova rota</h1>
      <RouteForm availableNumbers={numbers ?? []} />
    </div>
  );
}
