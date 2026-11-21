import { createSupabaseAdmin, getRouteNumbers, routeCacheKey, type RouteCacheEntry } from "@tracking/shared";

/**
 * Popula (ou repopula) o KV com TODAS as rotas cadastradas, usando a API
 * REST do Cloudflare diretamente (sem precisar do binding de um Worker
 * rodando). Util depois de uma migracao/seed nova, ou para "esquentar" o
 * cache logo apos o deploy — o redirect ja funciona sem isso (cache miss
 * cai no fallback do Supabase), mas evita a primeira requisicao mais lenta.
 */
async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_KV_NAMESPACE } =
    process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_KV_NAMESPACE) {
    console.error(
      "Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e CLOUDFLARE_KV_NAMESPACE."
    );
    process.exit(1);
  }

  const supabase = createSupabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: routes, error } = await supabase.from("routes").select("*");
  if (error) throw new Error(error.message);

  for (const route of routes ?? []) {
    const numbers = await getRouteNumbers(supabase, route.id);
    const entry: RouteCacheEntry = { route, numbers, cached_at: new Date().toISOString() };
    const key = routeCacheKey(route.slug);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }
    );

    if (!res.ok) {
      console.error(`Falha ao sincronizar ${route.slug}: HTTP ${res.status} ${await res.text()}`);
      continue;
    }

    console.log(`Rota '${route.slug}' sincronizada no KV (${numbers.length} numero(s)).`);
  }

  console.log("Sincronizacao concluida.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
