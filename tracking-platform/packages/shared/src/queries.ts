import type { TypedSupabaseClient } from "./supabase.js";
import type { Click, LeadBinding, Route, WhatsappNumber } from "./types.js";

/**
 * Consultas relacionadas escritas como duas queries simples em vez de
 * `.select("tabela(*)")` embutido do postgrest-js. Decisao deliberada: o
 * parser de embed do postgrest-js infere tipos a partir de `Relationships`
 * (metadados de FK) que teriamos que manter manualmente em sincronia com as
 * migrations e que sao dificeis de acertar com tipos literais de template
 * string — duas consultas indexadas (`in (...)`) sao tao rapidas quanto um
 * JOIN para os volumes deste projeto e muito mais faceis de manter tipadas.
 */

export async function getRouteBySlug(supabase: TypedSupabaseClient, slug: string): Promise<Route | null> {
  const { data, error } = await supabase.from("routes").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`erro ao buscar rota: ${error.message}`);
  return data ?? null;
}

export async function getRouteNumbers(supabase: TypedSupabaseClient, routeId: string): Promise<WhatsappNumber[]> {
  const { data: links, error: linksError } = await supabase.from("route_numbers").select("*").eq("route_id", routeId);

  if (linksError) throw new Error(`erro ao buscar vinculos da rota: ${linksError.message}`);
  const ids = (links ?? []).map((l) => l.whatsapp_number_id);
  if (ids.length === 0) return [];

  const { data: numbers, error: numbersError } = await supabase.from("whatsapp_numbers").select("*").in("id", ids);
  if (numbersError) throw new Error(`erro ao buscar numeros: ${numbersError.message}`);
  return numbers ?? [];
}

export interface RouteWithNumbers {
  route: Route;
  numbers: WhatsappNumber[];
}

export async function getRouteWithNumbers(supabase: TypedSupabaseClient, slug: string): Promise<RouteWithNumbers | null> {
  const route = await getRouteBySlug(supabase, slug);
  if (!route) return null;
  const numbers = await getRouteNumbers(supabase, route.id);
  return { route, numbers };
}

/**
 * Lead binding mais recente para um `phone_hash`, dentro de uma janela de
 * atribuicao, ordenado pelo horario do clique original (nao pelo horario em
 * que a mensagem chegou). Usado por `attributeOrder` (apps/worker) sem
 * depender de embed `lead_bindings.select("clicks!inner(clicked_at)")`.
 */
export async function getMostRecentLeadBindingForPhone(
  supabase: TypedSupabaseClient,
  phoneHash: string,
  windowStart: Date,
  windowEnd: Date
): Promise<(LeadBinding & { clicked_at: string }) | null> {
  const { data: bindings, error } = await supabase
    .from("lead_bindings")
    .select("*")
    .eq("phone_hash", phoneHash)
    .order("bound_at", { ascending: false })
    .limit(50);

  if (error || !bindings?.length) return null;

  const clickIds = bindings.map((b) => b.click_id);
  const { data: clicks, error: clicksError } = await supabase
    .from("clicks")
    .select("*")
    .in("id", clickIds)
    .gte("clicked_at", windowStart.toISOString())
    .lte("clicked_at", windowEnd.toISOString());

  if (clicksError || !clicks?.length) return null;

  const clickedAtById = new Map(clicks.map((c) => [c.id, c.clicked_at] as const));

  let best: (LeadBinding & { clicked_at: string }) | null = null;
  for (const binding of bindings) {
    const clickedAt = clickedAtById.get(binding.click_id);
    if (!clickedAt) continue;
    if (!best || clickedAt > best.clicked_at) {
      best = { ...binding, clicked_at: clickedAt };
    }
  }
  return best;
}

export async function getClickByRef(supabase: TypedSupabaseClient, clickRef: string): Promise<Click | null> {
  const { data, error } = await supabase.from("clicks").select("*").eq("click_ref", clickRef).maybeSingle();
  if (error) throw new Error(`erro ao buscar clique: ${error.message}`);
  return data ?? null;
}
