"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { refreshRouteCache, isWorkerConfigured } from "@/lib/worker-client";

const routeSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, "Use apenas letras minúsculas, números e hífen."),
  active: z.boolean(),
  whatsapp_message_template: z.string().min(1).max(2000),
  distribution_strategy: z.enum(["weighted", "round_robin"]),
  whatsapp_number_ids: z.array(z.string().uuid()).min(1, "Selecione ao menos um número."),
});

export type RouteFormState = { error?: string; ok?: boolean };

async function syncCache(slug: string) {
  if (!isWorkerConfigured()) return;
  try {
    await refreshRouteCache(slug);
  } catch (err) {
    console.error("[routes] falha ao sincronizar cache do Worker", err);
  }
}

export async function createRoute(input: unknown): Promise<RouteFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const { whatsapp_number_ids, ...routeData } = parsed.data;

  const { data: route, error } = await supabase.from("routes").insert(routeData).select("*").single();
  if (error) return { error: error.code === "23505" ? "Já existe uma rota com esse slug." : error.message };

  await supabase.from("route_numbers").insert(whatsapp_number_ids.map((id) => ({ route_id: route.id, whatsapp_number_id: id })));

  await writeAuditLog({ actorUserId: profile.id, action: "route.created", resourceType: "route", resourceId: route.id, after: route });
  await syncCache(route.slug);
  revalidatePath("/rotas");
  return { ok: true };
}

export async function updateRoute(routeId: string, input: unknown): Promise<RouteFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase.from("routes").select("*").eq("id", routeId).maybeSingle();
  const { whatsapp_number_ids, ...routeData } = parsed.data;

  const { data: route, error } = await supabase.from("routes").update(routeData).eq("id", routeId).select("*").single();
  if (error) return { error: error.code === "23505" ? "Já existe uma rota com esse slug." : error.message };

  await supabase.from("route_numbers").delete().eq("route_id", routeId);
  await supabase.from("route_numbers").insert(whatsapp_number_ids.map((id) => ({ route_id: routeId, whatsapp_number_id: id })));

  await writeAuditLog({ actorUserId: profile.id, action: "route.updated", resourceType: "route", resourceId: routeId, before, after: route });

  if (before?.slug && before.slug !== route.slug) await syncCache(before.slug);
  await syncCache(route.slug);

  revalidatePath("/rotas");
  return { ok: true };
}

export async function toggleRouteActive(routeId: string, active: boolean): Promise<RouteFormState> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  const supabase = getSupabaseAdmin();

  const { data: route, error } = await supabase.from("routes").update({ active }).eq("id", routeId).select("*").single();
  if (error) return { error: error.message };

  await writeAuditLog({
    actorUserId: profile.id,
    action: active ? "route.activated" : "route.deactivated",
    resourceType: "route",
    resourceId: routeId,
    after: route,
  });
  await syncCache(route.slug);
  revalidatePath("/rotas");
  return { ok: true };
}
