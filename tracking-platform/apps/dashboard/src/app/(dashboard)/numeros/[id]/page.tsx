import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NumberForm } from "../number-form";

export default async function EditarNumeroPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: number } = await supabase.from("whatsapp_numbers").select("*").eq("id", id).maybeSingle();
  if (!number) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Editar número — {number.label}</h1>
      <NumberForm editingId={number.id} initial={number} />
    </div>
  );
}
