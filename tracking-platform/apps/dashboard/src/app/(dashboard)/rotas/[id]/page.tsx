import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteForm } from "../route-form";

export default async function EditarRotaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const [{ data: route }, { data: numbers }, { data: routeNumbers }] = await Promise.all([
    supabase.from("routes").select("*").eq("id", id).maybeSingle(),
    supabase.from("whatsapp_numbers").select("*").order("label"),
    supabase.from("route_numbers").select("whatsapp_number_id").eq("route_id", id),
  ]);

  if (!route) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Editar rota — {route.name}</h1>
      <RouteForm
        editingId={route.id}
        availableNumbers={numbers ?? []}
        initial={{ ...route, whatsapp_number_ids: (routeNumbers ?? []).map((r) => r.whatsapp_number_id) }}
      />
    </div>
  );
}
