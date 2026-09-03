import type { ActionEntry } from "./actions";

export interface RawInsightRow {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  outbound_clicks?: ActionEntry[];
  unique_clicks?: string;
  ctr?: string;
  unique_ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
  cost_per_action_type?: ActionEntry[];
  conversions?: ActionEntry[];
  conversion_values?: ActionEntry[];
  purchase_roas?: ActionEntry[];
  website_purchase_roas?: ActionEntry[];
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export interface CampaignEntity {
  id: string;
  name: string;
  objective?: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  created_time?: string;
  updated_time?: string;
  start_time?: string;
  stop_time?: string;
}

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: { countries?: string[]; location_types?: string[] };
  targeting_automation?: { advantage_audience?: number };
}

export interface PromotedObject {
  pixel_id?: string;
  custom_event_type?: string;
  page_id?: string;
}

export interface AdSetEntity {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  optimization_goal?: string;
  billing_event?: string;
  targeting?: Targeting;
  promoted_object?: PromotedObject;
  destination_type?: string;
  created_time?: string;
  updated_time?: string;
}

export interface AdCreative {
  id?: string;
  name?: string;
  thumbnail_url?: string;
  object_type?: string;
  body?: string;
  title?: string;
}

export interface AdEntity {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  created_time?: string;
  updated_time?: string;
  creative?: AdCreative;
}

export interface AdAccountInfo {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent?: string;
  business_name?: string;
}
