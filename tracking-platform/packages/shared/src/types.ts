import type { AttributionMethod, MetaEventStatus, OrderStatus, ProfileRole } from "./constants.js";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
}

export type DistributionStrategy = "weighted" | "round_robin";

export interface Route {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  whatsapp_message_template: string;
  distribution_strategy: DistributionStrategy;
  fallback_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WhatsappNumber {
  id: string;
  label: string;
  phone: string;
  active: boolean;
  weight: number;
  group_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteNumber {
  route_id: string;
  whatsapp_number_id: string;
}

export interface Click {
  id: string;
  click_ref: string;
  route_id: string;
  whatsapp_number_id: string;
  clicked_at: string;
  created_at: string;
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
  lead_bound: boolean;
  lead_bound_at: string | null;
}

export interface PendingLeadBinding {
  id: string;
  click_ref: string;
  phone_hash: string;
  phone_last4: string;
  initial_message: string | null;
  crm_conversation_id: string | null;
  attempts: number;
  next_attempt_at: string;
  resolved: boolean;
  created_at: string;
}

export interface LeadBinding {
  id: string;
  click_id: string;
  click_ref: string;
  phone_hash: string;
  phone_last4: string;
  crm_lead_id: string | null;
  initial_message: string | null;
  bound_at: string;
  source: string;
  created_at: string;
}

export interface Order {
  id: string;
  crm_order_id: string;
  phone_hash: string | null;
  phone_last4: string | null;
  click_id: string | null;
  click_ref: string | null;
  status: OrderStatus;
  raw_status: string;
  value: number;
  currency: string;
  seller: string | null;
  ordered_at: string;
  paid_at: string | null;
  attribution_status: "attributed" | "unmatched";
  attribution_method: AttributionMethod;
  created_at: string;
  updated_at: string;
  raw_metadata: Record<string, unknown>;
}

export interface MetaEvent {
  id: string;
  event_id: string;
  order_id: string;
  click_id: string | null;
  event_name: string;
  event_time: string;
  payload_sanitized: Record<string, unknown>;
  status: MetaEventStatus;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  http_status: number | null;
  meta_response: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface WebhookLog {
  id: string;
  endpoint: string;
  request_id: string;
  status: number;
  duration_ms: number;
  result: string;
  payload_sanitized: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface AppSettings {
  attribution_window_days: number;
  default_currency: string;
  timezone: string;
  send_unmatched_orders_to_meta: boolean;
  crm_status_mapping: Record<string, "purchase" | "none">;
  log_retention_days: number;
  webhook_secret_mode: "hmac" | "bearer";
}
