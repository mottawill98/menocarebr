import { createSupabaseAdmin, DEFAULT_ATTRIBUTION_WINDOW_DAYS } from "@tracking/shared";
import type { AppSettings } from "@tracking/shared";
import type { Env } from "./env.js";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export interface ResolvedSettings {
  attribution_window_days: number;
  crm_status_mapping: Record<string, "purchase" | "none">;
  send_unmatched_orders_to_meta: boolean;
  default_currency: string;
}

const FALLBACK: ResolvedSettings = {
  attribution_window_days: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  crm_status_mapping: { approved: "purchase", paid: "purchase" },
  send_unmatched_orders_to_meta: false,
  default_currency: "BRL",
};

/** Le `app_settings` (linha unica). Se a tabela ainda nao tiver sido semeada, usa defaults seguros. */
export async function getSettings(env: Env): Promise<ResolvedSettings> {
  const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return getSettingsWithClient(supabase);
}

export async function getSettingsWithClient(supabase: SupabaseAdmin): Promise<ResolvedSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle()
    .returns<AppSettings & { id: 1; updated_at: string }>();
  if (!data) return FALLBACK;

  return {
    attribution_window_days: data.attribution_window_days,
    crm_status_mapping: data.crm_status_mapping as Record<string, "purchase" | "none">,
    send_unmatched_orders_to_meta: data.send_unmatched_orders_to_meta,
    default_currency: data.default_currency,
  };
}
