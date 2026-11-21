import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@tracking/shared";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Client Supabase autenticado com a sessao do usuario (cookies), usado em
 * Server Components e Server Actions para LEITURA. A RLS das migrations
 * (ver supabase/migrations) e quem decide o que cada `role` pode ver — este
 * client nunca usa a service role key.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component (nao pode escrever cookie) — o
          // `proxy.ts` ja cuida de renovar a sessao nesse caso.
        }
      },
    },
  });
}
