import { createSupabaseAdmin, type TypedSupabaseClient } from "@tracking/shared";

let cached: TypedSupabaseClient | null = null;

/**
 * Client com a service role key — SOMENTE em Server Actions/Route Handlers,
 * NUNCA em Server Components de leitura simples (essas usam
 * `createSupabaseServerClient`, respeitando RLS). Toda mutacao feita com
 * este client precisa ter sido precedida de uma checagem de `role` no
 * codigo (ver `src/lib/auth.ts#requireRole`).
 */
export function getSupabaseAdmin(): TypedSupabaseClient {
  if (!cached) {
    cached = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return cached;
}
