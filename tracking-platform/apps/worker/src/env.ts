export interface Env {
  // Bindings
  ROUTES_KV: KVNamespace;
  CLICKS_QUEUE: Queue<ClickQueueMessage>;
  META_EVENTS_QUEUE: Queue<MetaEventQueueMessage>;

  // Vars (nao sensiveis, definidas em wrangler.toml)
  META_GRAPH_VERSION: string;
  ENVIRONMENT: "development" | "staging" | "production";
  ATTRIBUTION_WINDOW_DAYS: string;

  // Secrets (via `wrangler secret put`, nunca comitados)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  META_ACCESS_TOKEN: string;
  META_DATASET_ID: string;
  META_TEST_EVENT_CODE?: string;
  /** Override de desenvolvimento — aponta para `scripts/mocks/meta-capi-mock.ts` em vez da Meta real. Nunca definido em produção. */
  META_GRAPH_BASE_URL?: string;
  CRM_WEBHOOK_SECRET: string;
  /**
   * Token interno (server-to-server) usado pelo Dashboard para chamar rotas
   * privilegiadas do Worker que nao existem como binding externo: invalidar
   * o cache de rota no KV, reenviar um meta_event manualmente e enviar um
   * evento de teste. Nunca exposto ao browser.
   */
  INTERNAL_API_TOKEN: string;
}

export interface ClickQueueMessage {
  click_ref: string;
  route_id: string;
  whatsapp_number_id: string;
  clicked_at: string;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  placement: string | null;
  referrer: string | null;
  client_user_agent: string | null;
  client_ip_address: string | null;
  extra_params: Record<string, unknown>;
}

export interface MetaEventQueueMessage {
  meta_event_id: string;
}
