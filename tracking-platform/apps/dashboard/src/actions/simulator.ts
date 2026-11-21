"use server";

import "server-only";
import { assertRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resendMetaEvent } from "@/lib/worker-client";

/**
 * Ferramenta de debug (item 55) — usa os endpoints REAIS do Worker (não
 * insere direto no banco), para exercitar o fluxo completo tal como um
 * clique de verdade faria. Sempre bloqueada em produção (checagem repetida
 * aqui, além de a página nem renderizar os botões).
 */
function assertNotProduction() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATOR_IN_PRODUCTION !== "true") {
    throw new Error("O simulador está desabilitado em produção.");
  }
}

const WORKER_URL = process.env.WORKER_URL;
const CRM_WEBHOOK_SECRET = process.env.CRM_WEBHOOK_SECRET_SIMULATOR || process.env.CRM_WEBHOOK_SECRET;

export interface SimulateClickResult {
  ok: boolean;
  error?: string;
  clickRef?: string;
  waUrl?: string;
}

export async function simulateClick(slug: string): Promise<SimulateClickResult> {
  await assertRole(["ADMIN"]);
  assertNotProduction();
  if (!WORKER_URL) return { ok: false, error: "WORKER_URL não configurado." };

  const res = await fetch(`${WORKER_URL}/r/${slug}?utm_source=simulador&campaign_name=Simulacao`, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) return { ok: false, error: `Worker respondeu ${res.status} sem redirect.` };

  const match = new URL(location).searchParams.get("text")?.match(/#([A-Z0-9]{8})/);
  if (!match) return { ok: false, error: "Não foi possível extrair o click_ref da mensagem gerada." };

  return { ok: true, clickRef: match[1], waUrl: location };
}

export interface SimulateMessageResult {
  ok: boolean;
  error?: string;
}

export async function simulateCrmMessage(clickRef: string, fakePhone: string): Promise<SimulateMessageResult> {
  await assertRole(["ADMIN"]);
  assertNotProduction();
  if (!WORKER_URL || !CRM_WEBHOOK_SECRET) return { ok: false, error: "WORKER_URL/CRM_WEBHOOK_SECRET não configurados." };

  const res = await fetch(`${WORKER_URL}/api/v1/webhooks/crm/message`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CRM_WEBHOOK_SECRET}` },
    body: JSON.stringify({ phone: fakePhone, message: `Olá, gostaria de saber mais sobre o Menocare 💜\n#${clickRef}` }),
  });

  if (!res.ok) return { ok: false, error: `Worker respondeu ${res.status}.` };
  return { ok: true };
}

export interface SimulateOrderResult {
  ok: boolean;
  error?: string;
  crmOrderId?: string;
}

export async function simulateOrder(fakePhone: string, clickRef: string): Promise<SimulateOrderResult> {
  await assertRole(["ADMIN"]);
  assertNotProduction();
  if (!WORKER_URL || !CRM_WEBHOOK_SECRET) return { ok: false, error: "WORKER_URL/CRM_WEBHOOK_SECRET não configurados." };

  const crmOrderId = `SIM-${Date.now()}`;
  const res = await fetch(`${WORKER_URL}/api/v1/webhooks/crm/order`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CRM_WEBHOOK_SECRET}` },
    body: JSON.stringify({
      order_id: crmOrderId,
      phone: fakePhone,
      status: "paid",
      value: 297,
      currency: "BRL",
      click_ref: clickRef,
    }),
  });

  if (!res.ok) return { ok: false, error: `Worker respondeu ${res.status}.` };
  return { ok: true, crmOrderId };
}

export interface ProcessMetaResult {
  ok: boolean;
  error?: string;
  status?: string;
}

export async function processMetaForOrder(crmOrderId: string): Promise<ProcessMetaResult> {
  await assertRole(["ADMIN"]);
  assertNotProduction();

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id").eq("crm_order_id", crmOrderId).maybeSingle();
  if (!order) return { ok: false, error: "Pedido ainda não foi persistido — aguarde alguns segundos e tente de novo." };

  const { data: event } = await supabase.from("meta_events").select("id, status").eq("order_id", order.id).maybeSingle();
  if (!event) return { ok: false, error: "Nenhum meta_event associado a este pedido (verifique o mapeamento de status)." };

  await resendMetaEvent(event.id);
  const { data: after } = await supabase.from("meta_events").select("status").eq("id", event.id).maybeSingle();
  return { ok: true, status: after?.status };
}
