import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@tracking/shared";

/** Client Supabase para o browser (login/logout, recuperacao de senha). Usa apenas a anon key. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
