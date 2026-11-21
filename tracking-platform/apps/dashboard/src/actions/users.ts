"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

const inviteSchema = z.object({ email: z.string().email(), role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) });

export type UserFormState = { error?: string; ok?: boolean };

/** Convida um usuário por e-mail via Supabase Auth (exige SMTP configurado no projeto — ver docs/DEPLOY.md). */
export async function inviteUser(input: unknown): Promise<UserFormState> {
  const profile = await assertRole(["ADMIN"]);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(parsed.data.email);
  if (error) return { error: error.message };

  if (parsed.data.role !== "VIEWER" && data.user) {
    await supabase.from("profiles").update({ role: parsed.data.role }).eq("id", data.user.id);
  }

  await writeAuditLog({ actorUserId: profile.id, action: "user.invited", resourceType: "profile", resourceId: data.user?.id, after: { email: parsed.data.email, role: parsed.data.role } });
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateUserRole(userId: string, role: "ADMIN" | "MANAGER" | "VIEWER"): Promise<UserFormState> {
  const profile = await assertRole(["ADMIN"]);
  const supabase = getSupabaseAdmin();

  const { data: before } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", userId).select("*").single();
  if (error) return { error: error.message };

  await writeAuditLog({ actorUserId: profile.id, action: "user.role_changed", resourceType: "profile", resourceId: userId, before, after: data });
  revalidatePath("/usuarios");
  return { ok: true };
}
