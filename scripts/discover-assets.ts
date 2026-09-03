import { graphGet, graphGetAllPages, MetaGraphError } from "../src/lib/meta/client";
import { setJson } from "../src/lib/db";

interface MeResponse {
  id: string;
  name?: string;
}

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent?: string;
  business_name?: string;
}

async function main() {
  console.log("1) Validando token via /me ...");
  const me = await graphGet<MeResponse>("/me", { fields: "id,name" });
  console.log(`   OK — token válido para: ${me.name ?? "(sem nome)"} (id: ${me.id})`);

  console.log("2) Buscando contas de anúncio via /me/adaccounts ...");
  const accounts = await graphGetAllPages<AdAccount>("/me/adaccounts", {
    fields:
      "id,account_id,name,account_status,currency,timezone_name,amount_spent,business_name",
    limit: "200",
  });

  console.log(`   Encontradas ${accounts.length} conta(s) de anúncio:`);
  for (const acc of accounts) {
    console.log(
      `   - ${acc.name} | id: ${acc.id} | status: ${acc.account_status} | moeda: ${acc.currency}`
    );
  }

  await setJson("raw:accounts", { fetchedAt: new Date().toISOString(), me: { id: me.id, name: me.name }, accounts });
  console.log(`\nSalvo no banco (chave "raw:accounts").`);
}

main().catch((err) => {
  if (err instanceof MetaGraphError) {
    console.error(`Erro da Graph API (HTTP ${err.status}):`, err.payload?.error);
  } else {
    console.error("Erro inesperado:", err);
  }
  process.exit(1);
});
