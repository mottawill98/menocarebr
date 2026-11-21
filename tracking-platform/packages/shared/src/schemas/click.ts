import { z } from "zod";

/**
 * Parametros conhecidos que o redirect sabe extrair explicitamente da query
 * string. Qualquer outra coisa cai em `extra_params`.
 *
 * Os nomes `{{campaign.name}}` etc. sao os placeholders dinamicos atuais de
 * URL de anuncio da Meta (Ads Manager > URL Parameters). Documentado em
 * docs/CRM_WEBHOOKS.md e docs/META_CAPI.md com a fonte consultada.
 */
export const KNOWN_CLICK_QUERY_KEYS = [
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "placement",
] as const;

// Parametros que jamais devem ser persistidos, mesmo se vierem na URL —
// protecao contra vazamento acidental de segredo em link de anuncio.
export const FORBIDDEN_EXTRA_PARAM_KEYS = new Set([
  "token",
  "access_token",
  "password",
  "authorization",
  "secret",
  "api_key",
  "apikey",
]);

export const clickQuerySchema = z.object({
  fbclid: z.string().max(512).optional(),
  utm_source: z.string().max(255).optional(),
  utm_medium: z.string().max(255).optional(),
  utm_campaign: z.string().max(255).optional(),
  utm_content: z.string().max(255).optional(),
  utm_term: z.string().max(255).optional(),
  campaign_id: z.string().max(128).optional(),
  campaign_name: z.string().max(512).optional(),
  adset_id: z.string().max(128).optional(),
  adset_name: z.string().max(512).optional(),
  ad_id: z.string().max(128).optional(),
  ad_name: z.string().max(512).optional(),
  placement: z.string().max(255).optional(),
});

export type ClickQuery = z.infer<typeof clickQuerySchema>;

export const clickInsertSchema = z.object({
  click_ref: z.string().length(8),
  route_id: z.string().uuid(),
  whatsapp_number_id: z.string().uuid(),
  clicked_at: z.string(),
  fbclid: z.string().nullable().optional(),
  fbc: z.string().nullable().optional(),
  fbp: z.string().nullable().optional(),
  utm_source: z.string().nullable().optional(),
  utm_medium: z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  utm_content: z.string().nullable().optional(),
  utm_term: z.string().nullable().optional(),
  campaign_id: z.string().nullable().optional(),
  campaign_name: z.string().nullable().optional(),
  adset_id: z.string().nullable().optional(),
  adset_name: z.string().nullable().optional(),
  ad_id: z.string().nullable().optional(),
  ad_name: z.string().nullable().optional(),
  placement: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  client_user_agent: z.string().nullable().optional(),
  client_ip_address: z.string().nullable().optional(),
  extra_params: z.record(z.string(), z.unknown()).default({}),
});

export type ClickInsert = z.infer<typeof clickInsertSchema>;

/** Sanitiza a query string do redirect em campos conhecidos + extra_params. */
export function splitKnownAndExtraParams(searchParams: URLSearchParams): {
  known: Record<string, string>;
  extra: Record<string, string>;
} {
  const known: Record<string, string> = {};
  const extra: Record<string, string> = {};
  const knownKeys = new Set<string>(KNOWN_CLICK_QUERY_KEYS);

  for (const [key, value] of searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_EXTRA_PARAM_KEYS.has(lowerKey)) continue;
    if (knownKeys.has(key)) {
      known[key] = value;
    } else {
      extra[key] = value;
    }
  }

  return { known, extra };
}
