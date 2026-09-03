export const METRIC_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "inline_link_clicks",
  "outbound_clicks",
  "unique_clicks",
  "ctr",
  "unique_ctr",
  "cpc",
  "cpm",
  "cpp",
  "actions",
  "action_values",
  "cost_per_action_type",
  "conversions",
  "conversion_values",
  "purchase_roas",
  "website_purchase_roas",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
  "date_start",
  "date_stop",
] as const;

export const LEVEL_ID_FIELDS: Record<"account" | "campaign" | "adset" | "ad", string[]> = {
  account: ["account_id", "account_name"],
  campaign: ["campaign_id", "campaign_name", "objective"],
  adset: ["campaign_id", "campaign_name", "adset_id", "adset_name"],
  ad: ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"],
};

export function buildInsightsFields(level: "account" | "campaign" | "adset" | "ad"): string {
  return [...LEVEL_ID_FIELDS[level], ...METRIC_FIELDS].join(",");
}

export const ENTITY_FIELDS = {
  campaign:
    "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,created_time,updated_time,start_time,stop_time",
  adset:
    "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,targeting,promoted_object,destination_type,created_time,updated_time",
  ad: "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative{id,name,thumbnail_url,object_type,body,title}",
};
