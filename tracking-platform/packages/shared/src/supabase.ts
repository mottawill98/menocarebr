import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  AuditLog,
  Click,
  LeadBinding,
  MetaEvent,
  Order,
  PendingLeadBinding,
  Profile,
  Route,
  RouteNumber,
  WebhookLog,
  WhatsappNumber,
} from "./types.js";

/**
 * Achata um `interface` nomeado (ou uma intersecao `Partial<X> & {...}`) num
 * tipo objeto literal resolvido. Necessario aqui: o parser de tipos do
 * postgrest-js, ao processar o `Database` inteiro dentro de uma cadeia
 * `.from().select()/.insert()`, nao resolve corretamente uma referencia a um
 * `interface` (ou a uma intersecao envolvendo `Partial<InterfaceNomeado>`) —
 * o resultado colapsa silenciosamente para `never` em vez de erro. Trocar
 * por um tipo mapeado (`{ [K in keyof T]: T[K] }`) forca a resolucao
 * completa antes de chegar no postgrest-js. Comportamento confirmado por
 * reproducao minima nesta versao do @supabase/postgrest-js — se a lib for
 * atualizada, vale re-testar se o wrapper ainda e necessario.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Tipagem manual das tabelas (em vez de `supabase gen types`) para manter o
 * pacote `shared` sem dependencia de uma CLI externa durante o build. Precisa
 * ser mantida em sincronia com `supabase/migrations` — qualquer coluna nova
 * deve ser adicionada aqui tambem.
 *
 * `Relationships: []` em cada tabela: nao usamos o parser de `select`
 * embutido do postgrest-js (`.select("foo(*)")`) para resolver joins — ver
 * `queries.ts`, que busca tabelas relacionadas com duas consultas simples em
 * vez de embed, evitando depender da inferencia de tipo de FK do
 * postgrest-js (fragil de manter manualmente em sincronia).
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Prettify<Profile>;
        Insert: Prettify<Partial<Profile> & { id: string; email: string }>;
        Update: Prettify<Partial<Profile>>;
        Relationships: [];
      };
      routes: {
        Row: Prettify<Route>;
        Insert: Prettify<Partial<Route> & { name: string; slug: string }>;
        Update: Prettify<Partial<Route>>;
        Relationships: [];
      };
      whatsapp_numbers: {
        Row: Prettify<WhatsappNumber>;
        Insert: Prettify<Partial<WhatsappNumber> & { label: string; phone: string }>;
        Update: Prettify<Partial<WhatsappNumber>>;
        Relationships: [];
      };
      route_numbers: {
        Row: Prettify<RouteNumber>;
        Insert: Prettify<RouteNumber>;
        Update: Prettify<Partial<RouteNumber>>;
        Relationships: [];
      };
      clicks: {
        Row: Prettify<Click>;
        Insert: Prettify<Partial<Click> & { click_ref: string; route_id: string; whatsapp_number_id: string }>;
        Update: Prettify<Partial<Click>>;
        Relationships: [];
      };
      pending_lead_bindings: {
        Row: Prettify<PendingLeadBinding>;
        Insert: Prettify<Partial<PendingLeadBinding> & { click_ref: string; phone_hash: string; phone_last4: string }>;
        Update: Prettify<Partial<PendingLeadBinding>>;
        Relationships: [];
      };
      lead_bindings: {
        Row: Prettify<LeadBinding>;
        Insert: Prettify<
          Partial<LeadBinding> & { click_id: string; click_ref: string; phone_hash: string; phone_last4: string }
        >;
        Update: Prettify<Partial<LeadBinding>>;
        Relationships: [];
      };
      orders: {
        Row: Prettify<Order>;
        Insert: Prettify<Partial<Order> & { crm_order_id: string; raw_status: string }>;
        Update: Prettify<Partial<Order>>;
        Relationships: [];
      };
      meta_events: {
        Row: Prettify<MetaEvent>;
        Insert: Prettify<
          Partial<MetaEvent> & {
            event_id: string;
            order_id: string;
            event_time: string;
            payload_sanitized: Record<string, unknown>;
          }
        >;
        Update: Prettify<Partial<MetaEvent>>;
        Relationships: [];
      };
      audit_logs: {
        Row: Prettify<AuditLog>;
        Insert: Prettify<Partial<AuditLog> & { action: string; resource_type: string }>;
        Update: Prettify<Partial<AuditLog>>;
        Relationships: [];
      };
      webhook_logs: {
        Row: Prettify<WebhookLog>;
        Insert: Prettify<
          Partial<WebhookLog> & { endpoint: string; request_id: string; status: number; duration_ms: number; result: string }
        >;
        Update: Prettify<Partial<WebhookLog>>;
        Relationships: [];
      };
      app_settings: {
        Row: Prettify<AppSettings & { id: 1; updated_at: string }>;
        Insert: Prettify<Partial<AppSettings>>;
        Update: Prettify<Partial<AppSettings>>;
        Relationships: [];
      };
      redirect_misses: {
        Row: Prettify<{
          id: string;
          slug: string;
          reason: "not_found" | "inactive";
          client_ip_address: string | null;
          client_user_agent: string | null;
          created_at: string;
        }>;
        Insert: Prettify<{
          slug: string;
          reason: "not_found" | "inactive";
          client_ip_address?: string | null;
          client_user_agent?: string | null;
        }>;
        Update: Prettify<{ slug?: string; reason?: "not_found" | "inactive" }>;
        Relationships: [];
      };
    };
    Views: {
      click_funnel: {
        Row: Prettify<{
          click_id: string;
          click_ref: string;
          route_id: string;
          whatsapp_number_id: string;
          clicked_at: string;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          campaign_id: string | null;
          campaign_name: string | null;
          adset_id: string | null;
          adset_name: string | null;
          ad_id: string | null;
          ad_name: string | null;
          placement: string | null;
          lead_bound: boolean;
          lead_binding_id: string | null;
          lead_bound_at: string | null;
          order_id: string | null;
          order_status: string | null;
          order_value: number | null;
          order_currency: string | null;
          order_paid_at: string | null;
          order_attribution_method: string | null;
        }>;
        Relationships: [];
      };
      order_attribution_coverage: {
        Row: Prettify<{
          day: string;
          total_orders: number;
          attributed_orders: number;
          unmatched_orders: number;
        }>;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Client com a service role key: usado SOMENTE server-side (Worker, Server
 * Actions, Route Handlers). Ignora RLS por definicao — nunca deve ser
 * exposto ao browser.
 */
export function createSupabaseAdmin(url: string, serviceRoleKey: string): TypedSupabaseClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
