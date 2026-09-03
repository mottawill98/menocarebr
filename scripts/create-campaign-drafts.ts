/**
 * Script único, fora da aplicação, para criar os 3 rascunhos de campanha
 * discutidos em reports/campaign-drafts.md diretamente na Meta — sempre em
 * status PAUSED. Não é wired à dashboard (que permanece somente leitura) e
 * não deve ser reexecutado sem revisão (reexecutar duplicaria os rascunhos).
 *
 * Uso: node --env-file=.env.local -r tsx/cjs scripts/create-campaign-drafts.ts
 */
import { MetaGraphError } from "../src/lib/meta/client";

const ACCOUNT_ID = "act_514241761599399";
const API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";
const BASE_URL = `${process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com"}/${API_VERSION}`;

function getToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN ausente");
  return token;
}

async function graphPost<T = Record<string, unknown>>(path: string, params: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  body.set("access_token", getToken());

  const res = await fetch(url.toString(), { method: "POST", body });
  const json = (await res.json()) as T & { error?: unknown };
  if (!res.ok || (json as { error?: unknown }).error) {
    throw new MetaGraphError(res.status, json as never);
  }
  return json;
}

// Público comprovadamente vencedor, replicado dos conjuntos com melhor CPA/ROAS (30d).
const WINNING_TARGETING = {
  age_min: 40,
  age_max: 65,
  genders: [2],
  geo_locations: { countries: ["BR"], location_types: ["home", "recent"] },
};

const PROMOTED_OBJECT = {
  pixel_id: "1263167671730670",
  custom_event_type: "PURCHASE",
  page_id: "544261512107297",
};

const WINNING_CREATIVES = [
  { label: "IMG20", creative_id: "27781673691454958" },
  { label: "C44", creative_id: "3991510104314718" },
  { label: "C16 (prova social)", creative_id: "2664803830580410" },
  { label: "C41", creative_id: "2164927217410682" },
  { label: "IMG09", creative_id: "900006086029750" },
];

async function createAdsForAdset(adsetId: string, adsetLabel: string) {
  for (const c of WINNING_CREATIVES) {
    const ad = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/ads`, {
      name: `[RASCUNHO] ${c.label} — ${adsetLabel}`,
      adset_id: adsetId,
      creative: { creative_id: c.creative_id },
      status: "PAUSED",
    });
    console.log(`    anúncio criado (${c.label}): ${ad.id}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

// Já criada numa tentativa anterior (interrompida por permissão de Página) — reaproveitar em vez de duplicar.
const EXISTING_CAMPAIGN_1_ID = "120251675576740229";

async function main() {
  console.log("=== RASCUNHO 1 — Escala consolidada dos vencedores ===");
  const campaign1 = EXISTING_CAMPAIGN_1_ID
    ? { id: EXISTING_CAMPAIGN_1_ID }
    : await graphPost<{ id: string }>(`/${ACCOUNT_ID}/campaigns`, {
        name: "[RASCUNHO - NÃO ATIVAR] Escala consolidada dos vencedores",
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        special_ad_categories: [],
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        daily_budget: 30000, // R$ 300,00/dia (centavos)
      });
  console.log("Campanha (reaproveitada):", campaign1.id);

  const adset1 = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/adsets`, {
    name: "Público vencedor (Mulheres 40-65, BR)",
    campaign_id: campaign1.id,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    targeting: WINNING_TARGETING,
    promoted_object: PROMOTED_OBJECT,
    destination_type: "WHATSAPP",
    status: "PAUSED",
  });
  console.log("Conjunto criado:", adset1.id);
  await createAdsForAdset(adset1.id, "Rascunho 1");

  console.log("\n=== RASCUNHO 3 — Teste de expansão de público (Advantage+ Audience) ===");
  const campaign3 = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/campaigns`, {
    name: "[RASCUNHO - NÃO ATIVAR] Teste Advantage+ Audience",
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [],
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: 18000, // R$ 180,00/dia (centavos)
  });
  console.log("Campanha criada:", campaign3.id);

  const adsetControl = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/adsets`, {
    name: "Controle — público manual (igual ao vencedor)",
    campaign_id: campaign3.id,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    targeting: WINNING_TARGETING,
    promoted_object: PROMOTED_OBJECT,
    destination_type: "WHATSAPP",
    status: "PAUSED",
  });
  console.log("Conjunto (controle) criado:", adsetControl.id);
  await createAdsForAdset(adsetControl.id, "Rascunho 3 - Controle");

  const adsetAdvantage = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/adsets`, {
    name: "Teste — Advantage+ Audience",
    campaign_id: campaign3.id,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    targeting: {
      ...WINNING_TARGETING,
      targeting_automation: { advantage_audience: 1 },
    },
    promoted_object: PROMOTED_OBJECT,
    destination_type: "WHATSAPP",
    status: "PAUSED",
  });
  console.log("Conjunto (Advantage+) criado:", adsetAdvantage.id);
  await createAdsForAdset(adsetAdvantage.id, "Rascunho 3 - Advantage+");

  console.log("\n=== RASCUNHO 2 — Teste de variações de prova social (somente estrutura) ===");
  const campaign2 = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/campaigns`, {
    name: "[RASCUNHO - NÃO ATIVAR] Teste variações de prova social",
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [],
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: 12000, // R$ 120,00/dia (centavos)
  });
  console.log("Campanha criada:", campaign2.id);

  const adset2 = await graphPost<{ id: string }>(`/${ACCOUNT_ID}/adsets`, {
    name: "Público vencedor (Mulheres 40-65, BR) — aguardando novos criativos",
    campaign_id: campaign2.id,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    targeting: WINNING_TARGETING,
    promoted_object: PROMOTED_OBJECT,
    destination_type: "WHATSAPP",
    status: "PAUSED",
  });
  console.log("Conjunto criado (sem anúncios — aguarda criativos novos):", adset2.id);

  console.log("\nTudo criado com status PAUSED. Nada foi ativado.");
}

main().catch((err) => {
  if (err instanceof MetaGraphError) {
    console.error("\nERRO da Graph API:", err.status, JSON.stringify(err.payload?.error, null, 2));
  } else {
    console.error("\nErro inesperado:", err);
  }
  console.error("Interrompido — revise o que já foi criado no Gerenciador de Anúncios antes de tentar de novo.");
  process.exit(1);
});
