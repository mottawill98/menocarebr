"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

const settingsSchema = z.object({
  attribution_window_days: z.coerce.number().int().min(1).max(365),
  default_currency: z.string().length(3),
  timezone: z.string().min(1),
  send_unmatched_orders_to_meta: z.boolean(),
  log_retention_days: z.coerce.number().int().min(1).max(3650),
  webhook_secret_mode: z.enum(["hmac", "bearer"]),
  crm_status_mapping: z.record(z.string(), z.enum(["purchase", "none"])),
});

export async function updateSettings(input: unknown): Promise<{ error?: string; ok?: boolean }> {
  const profile = await assertRole(["ADMIN"]);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  const { data, error } = await supabase.from("app_settings").update(parsed.data).eq("id", 1).select("*").single();
  if (error) return { error: error.message };

  await writeAuditLog({ actorUserId: profile.id, action: "settings.updated", resourceType: "app_settings", resourceId: "1", before, after: data });
  revalidatePath("/configuracoes");
  return { ok: true };
}
