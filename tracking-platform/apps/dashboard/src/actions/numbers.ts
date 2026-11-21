"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizePhone } from "@tracking/shared";

const numberSchema = z.object({
  label: z.string().min(1).max(255),
  phone: z.string().min(8).max(20),
  active: z.boolean(),
  weight: z.coerce.number().int().min(0).max(1000),
  group_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type NumberFormState = { error?: string; ok?: boolean };

export async function createNumber(input: unknown): Promise<NumberFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const parsed = numberSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const phone = normalizePhone(parsed.data.phone);

  const { data, error } = await supabase
    .from("whatsapp_numbers")
    .insert({ ...parsed.data, phone })
    .select("*")
    .single();

  if (error) return { error: error.code === "23505" ? "Já existe um número com esse telefone." : error.message };

  await writeAuditLog({ actorUserId: profile.id, action: "whatsapp_number.created", resourceType: "whatsapp_number", resourceId: data.id, after: data });
  revalidatePath("/numeros");
  return { ok: true };
}

export async function updateNumber(id: string, input: unknown): Promise<NumberFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const parsed = numberSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase.from("whatsapp_numbers").select("*").eq("id", id).maybeSingle();
  const phone = normalizePhone(parsed.data.phone);

  const { data, error } = await supabase
    .from("whatsapp_numbers")
    .update({ ...parsed.data, phone })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { error: error.code === "23505" ? "Já existe um número com esse telefone." : error.message };

  await writeAuditLog({ actorUserId: profile.id, action: "whatsapp_number.updated", resourceType: "whatsapp_number", resourceId: id, before, after: data });
  revalidatePath("/numeros");
  return { ok: true };
}

export async function toggleNumberActive(id: string, active: boolean): Promise<NumberFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.from("whatsapp_numbers").update({ active }).eq("id", id).select("*").single();
  if (error) return { error: error.message };

  await writeAuditLog({
    actorUserId: profile.id,
    action: active ? "whatsapp_number.activated" : "whatsapp_number.deactivated",
    resourceType: "whatsapp_number",
    resourceId: id,
    after: data,
  });
  revalidatePath("/numeros");
  return { ok: true };
}
