import type { Database } from "@tracking/shared";

/**
 * Funcoes puras (sem `server-only`, sem I/O) — deliberadamente separadas de
 * `overview.ts` para poderem ser testadas com Vitest sem carregar nada do
 * runtime de Server Components.
 */
export type ClickFunnelRow = Database["public"]["Views"]["click_funnel"]["Row"];

export interface OverviewMetrics {
  clicks: number;
  leads: number;
  orders: number;
  purchases: number;
  revenue: number;
  clickToLead: number;
  leadToPurchase: number;
  clickToPurchase: number;
  averageTicket: number;
  trackingCoverage: number;
}

const PURCHASE_STATUSES = new Set(["paid", "approved"]);

export function computeOverviewMetrics(rows: ClickFunnelRow[]): OverviewMetrics {
  const clickIds = new Set(rows.map((r) => r.click_id));
  const leadIds = new Set(rows.filter((r) => r.lead_bound).map((r) => r.click_id));
  const orderIds = new Set(rows.filter((r) => r.order_id).map((r) => r.order_id));
  const purchaseRows = rows.filter((r) => r.order_id && r.order_status && PURCHASE_STATUSES.has(r.order_status));
  const purchaseIds = new Set(purchaseRows.map((r) => r.order_id));
  const revenue = purchaseRows.reduce((sum, r) => sum + (r.order_value ?? 0), 0);

  const clicks = clickIds.size;
  const leads = leadIds.size;
  const orders = orderIds.size;
  const purchases = purchaseIds.size;

  return {
    clicks,
    leads,
    orders,
    purchases,
    revenue,
    clickToLead: clicks ? leads / clicks : 0,
    leadToPurchase: leads ? purchases / leads : 0,
    clickToPurchase: clicks ? purchases / clicks : 0,
    averageTicket: purchases ? revenue / purchases : 0,
    trackingCoverage: clicks ? leads / clicks : 0,
  };
}

export interface FunnelStep {
  label: string;
  value: number;
}

export function computeFunnelSteps(metrics: OverviewMetrics): FunnelStep[] {
  return [
    { label: "Cliques", value: metrics.clicks },
    { label: "Leads identificados", value: metrics.leads },
    { label: "Pedidos", value: metrics.orders },
    { label: "Compras", value: metrics.purchases },
  ];
}

export interface CampaignRow {
  key: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
}

/** Agrupa por nivel (campanha, conjunto ou anuncio) para a página de Campanhas (item 31) e seu drill-down. */
export function computeCampaignTable(rows: ClickFunnelRow[], level: "campaign" | "adset" | "ad"): CampaignRow[] {
  const groups = new Map<string, CampaignRow & { clickIds: Set<string>; leadClickIds: Set<string>; orderIds: Set<string> }>();

  for (const row of rows) {
    const key =
      level === "campaign"
        ? row.campaign_id ?? "sem-campanha"
        : level === "adset"
          ? row.adset_id ?? "sem-conjunto"
          : row.ad_id ?? "sem-anuncio";

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        clicks: 0,
        leads: 0,
        purchases: 0,
        revenue: 0,
        clickIds: new Set(),
        leadClickIds: new Set(),
        orderIds: new Set(),
      };
      groups.set(key, group);
    }

    group.clickIds.add(row.click_id);
    if (row.lead_bound) group.leadClickIds.add(row.click_id);
    if (row.order_id && row.order_status && PURCHASE_STATUSES.has(row.order_status) && !group.orderIds.has(row.order_id)) {
      group.orderIds.add(row.order_id);
      group.revenue += row.order_value ?? 0;
    }
  }

  return Array.from(groups.values()).map((g) => ({
    key: g.key,
    campaign_id: g.campaign_id,
    campaign_name: g.campaign_name,
    adset_id: g.adset_id,
    adset_name: g.adset_name,
    ad_id: g.ad_id,
    ad_name: g.ad_name,
    clicks: g.clickIds.size,
    leads: g.leadClickIds.size,
    purchases: g.orderIds.size,
    revenue: g.revenue,
  }));
}
