import type { RedirectConfig } from "./store";

const GRAPH_VERSION = "v21.0";

interface CapiEventInput {
  config: RedirectConfig;
  eventSourceUrl: string;
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  contentName?: string;
}

/**
 * Constrói o valor do cookie `_fbc` quando ele ainda não existe mas a URL
 * trouxe um `fbclid` — formato exigido pela Meta para o clique ser
 * corretamente atribuído no Conversions API.
 */
export function buildFbc(fbclid: string | undefined, existingFbc: string | undefined): string | undefined {
  if (existingFbc) return existingFbc;
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Envia o evento server-side para o Conversions API da Meta. Roda em segundo
 * plano (via `after`) e nunca lança — uma falha de rede ou token inválido não
 * pode atrasar nem quebrar o redirect do usuário para o WhatsApp.
 */
export async function sendCapiEvent(input: CapiEventInput): Promise<void> {
  const { config } = input;
  if (!config.pixelId || !config.pixelToken) return;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events`;
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: config.eventName || "Contact",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: input.eventSourceUrl,
        user_data: {
          client_ip_address: input.clientIp,
          client_user_agent: input.userAgent,
          fbp: input.fbp,
          fbc: input.fbc,
        },
        custom_data: input.contentName ? { content_name: input.contentName } : undefined,
      },
    ],
    access_token: config.pixelToken,
  };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[capi] Falha ao enviar evento (HTTP ${res.status}): ${text}`);
    }
  } catch (err) {
    console.error("[capi] Erro de rede ao enviar evento:", err);
  }
}
