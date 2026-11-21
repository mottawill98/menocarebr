import "server-only";
import { redirect } from "next/navigation";
import type { Profile, ProfileRole } from "@tracking/shared";
import { createSupabaseServerClient } from "./supabase/server";

/** Perfil (com `role`) do usuario logado, ou `null` se nao houver sessao. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return profile ?? null;
}

/**
 * Usado no topo de Server Components de pagina para exigir sessao + um dos
 * `roles` permitidos. Redireciona para `/login` sem sessao, ou para `/` (com
 * mensagem) se o role nao tiver permissao — nunca so esconde o botao no
 * frontend (a escrita real tambem e checada de novo em cada Server Action).
 */
export async function requireRole(roles: ProfileRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect("/?erro=sem-permissao");
  return profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para executar esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Mesma checagem de `requireRole`, mas para uso dentro de Server Actions (lança em vez de redirecionar). */
export async function assertRole(roles: ProfileRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new ForbiddenError("Sessão expirada. Faça login novamente.");
  if (!roles.includes(profile.role)) throw new ForbiddenError();
  return profile;
}
