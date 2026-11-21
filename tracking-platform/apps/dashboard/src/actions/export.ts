"use server";

import { toCsv } from "@/lib/csv";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { DateRange } from "@/lib/date-range";

export async function exportClicksCsv(range: DateRange): Promise<string> {
  await requireProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clicks")
    .select("*")
    .gte("clicked_at", range.from.toISOString())
    .lte("clicked_at", range.to.toISOString())
    .order("clicked_at", { ascending: false });

  const rows = (data ?? []).map((c) => ({
    clicked_at: formatDateTime(c.clicked_at),
    click_ref: c.click_ref,
    campaign_name: c.campaign_name,
    adset_name: c.adset_name,
    ad_name: c.ad_name,
    utm_source: c.utm_source,
    utm_medium: c.utm_medium,
    lead_bound: c.lead_bound ? "sim" : "não",
  }));

  return toCsv(rows, ["clicked_at", "click_ref", "campaign_name", "adset_name", "ad_name", "utm_source", "utm_medium", "lead_bound"]);
}

export async function exportLeadsCsv(range: DateRange): Promise<string> {
  await requireProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("lead_bindings")
    .select("*")
    .gte("bound_at", range.from.toISOString())
    .lte("bound_at", range.to.toISOString())
    .order("bound_at", { ascending: false });

  const rows = (data ?? []).map((l) => ({
    bound_at: formatDateTime(l.bound_at),
    click_ref: l.click_ref,
    phone_last4: l.phone_last4,
    source: l.source,
  }));

  return toCsv(rows, ["bound_at", "click_ref", "phone_last4", "source"]);
}

export async function exportOrdersCsv(range: DateRange): Promise<string> {
  await requireProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .gte("ordered_at", range.from.toISOString())
    .lte("ordered_at", range.to.toISOString())
    .order("ordered_at", { ascending: false });

  const rows = (data ?? []).map((o) => ({
    ordered_at: formatDateTime(o.ordered_at),
    crm_order_id: o.crm_order_id,
    phone_last4: o.phone_last4,
    value: o.value,
    currency: o.currency,
    status: o.status,
    attribution_method: o.attribution_method,
    click_ref: o.click_ref,
  }));

  return toCsv(rows, ["ordered_at", "crm_order_id", "phone_last4", "value", "currency", "status", "attribution_method", "click_ref"]);
}

export async function exportMetaEventsCsv(): Promise<string> {
  await requireProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("meta_events").select("*").order("created_at", { ascending: false }).limit(1000);

  const rows = (data ?? []).map((e) => ({
    created_at: formatDateTime(e.created_at),
    event_id: e.event_id,
    status: e.status,
    attempts: e.attempts,
    http_status: e.http_status,
    sent_at: formatDateTime(e.sent_at),
    error_message: e.error_message,
  }));

  return toCsv(rows, ["created_at", "event_id", "status", "attempts", "http_status", "sent_at", "error_message"]);
}
