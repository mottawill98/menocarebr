import "server-only";
import type { TypedSupabaseClient } from "@tracking/shared";
import type { DateRange } from "@/lib/date-range";
import type { ClickFunnelRow } from "./overview-compute";

export * from "./overview-compute";

/**
 * Le a view `click_funnel` (click -> lead -> pedido) no intervalo de datas.
 * Toda a agregacao (funil, cards, tabela de campanhas) e feita em memoria em
 * cima deste resultado — volume esperado do projeto (milhares de linhas por
 * período) nao justifica RPCs de agregação no banco ainda.
 */
export async function fetchClickFunnelRows(supabase: TypedSupabaseClient, range: DateRange): Promise<ClickFunnelRow[]> {
  const { data, error } = await supabase
    .from("click_funnel")
    .select("*")
    .gte("clicked_at", range.from.toISOString())
    .lte("clicked_at", range.to.toISOString());

  if (error) throw new Error(`erro ao buscar click_funnel: ${error.message}`);
  return data ?? [];
}
