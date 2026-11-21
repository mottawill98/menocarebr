import { getClickByRef, getMostRecentLeadBindingForPhone, type TypedSupabaseClient, type AttributionMethod } from "@tracking/shared";

export interface AttributionResult {
  clickId: string | null;
  clickRef: string | null;
  method: AttributionMethod;
  status: "attributed" | "unmatched";
}

/**
 * Atribuicao de pedido a clique (item 16 do briefing), nesta ordem de
 * prioridade:
 *  1. `click_ref` explicito no payload do pedido.
 *  2. `lead_binding` mais recente para o `phone_hash`, dentro da janela de
 *     atribuicao configuravel.
 *  3. `unmatched` — nunca inventamos uma campanha para o pedido.
 */
export async function attributeOrder(
  supabase: TypedSupabaseClient,
  input: { clickRef: string | null; phoneHash: string | null; orderedAt: Date; attributionWindowDays: number }
): Promise<AttributionResult> {
  if (input.clickRef) {
    const click = await getClickByRef(supabase, input.clickRef);
    if (click) {
      return { clickId: click.id, clickRef: click.click_ref, method: "click_ref", status: "attributed" };
    }
  }

  if (input.phoneHash) {
    const windowStart = new Date(input.orderedAt.getTime() - input.attributionWindowDays * 24 * 60 * 60 * 1000);
    const mostRecent = await getMostRecentLeadBindingForPhone(supabase, input.phoneHash, windowStart, input.orderedAt);
    if (mostRecent) {
      return { clickId: mostRecent.click_id, clickRef: mostRecent.click_ref, method: "phone_hash", status: "attributed" };
    }
  }

  return { clickId: null, clickRef: input.clickRef ?? null, method: "unmatched", status: "unmatched" };
}
