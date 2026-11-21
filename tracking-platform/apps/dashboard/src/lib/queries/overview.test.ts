import { describe, expect, it } from "vitest";
import { computeCampaignTable, computeOverviewMetrics, type ClickFunnelRow } from "./overview-compute";

function row(overrides: Partial<ClickFunnelRow>): ClickFunnelRow {
  return {
    click_id: "c1",
    click_ref: "REF",
    route_id: "r1",
    whatsapp_number_id: "n1",
    clicked_at: "2026-01-01T00:00:00Z",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    campaign_id: "camp1",
    campaign_name: "Campanha 1",
    adset_id: "adset1",
    adset_name: "Conjunto 1",
    ad_id: "ad1",
    ad_name: "Anúncio 1",
    placement: null,
    lead_bound: false,
    lead_binding_id: null,
    lead_bound_at: null,
    order_id: null,
    order_status: null,
    order_value: null,
    order_currency: null,
    order_paid_at: null,
    order_attribution_method: null,
    ...overrides,
  };
}

describe("computeOverviewMetrics", () => {
  it("nunca confunde clique com lead (item 61)", () => {
    const rows = [row({ click_id: "c1", lead_bound: false }), row({ click_id: "c2", lead_bound: true })];
    const metrics = computeOverviewMetrics(rows);
    expect(metrics.clicks).toBe(2);
    expect(metrics.leads).toBe(1);
  });

  it("conta cada pedido pago uma unica vez mesmo com multiplas linhas para o mesmo click", () => {
    const rows = [
      row({ click_id: "c1", order_id: "o1", order_status: "paid", order_value: 100 }),
      row({ click_id: "c1", order_id: "o1", order_status: "paid", order_value: 100 }),
    ];
    const metrics = computeOverviewMetrics(rows);
    expect(metrics.purchases).toBe(1);
  });

  it("calcula receita e ticket medio somente de compras pagas/aprovadas", () => {
    const rows = [
      row({ click_id: "c1", order_id: "o1", order_status: "paid", order_value: 100 }),
      row({ click_id: "c2", order_id: "o2", order_status: "pending", order_value: 50 }),
    ];
    const metrics = computeOverviewMetrics(rows);
    expect(metrics.revenue).toBe(100);
    expect(metrics.averageTicket).toBe(100);
  });

  it("retorna zero (nao NaN) quando nao ha cliques", () => {
    const metrics = computeOverviewMetrics([]);
    expect(metrics.clickToLead).toBe(0);
    expect(metrics.trackingCoverage).toBe(0);
  });
});

describe("computeCampaignTable", () => {
  it("agrupa por campanha somando cliques e receita distintos", () => {
    const rows = [
      row({ click_id: "c1", campaign_id: "camp1", order_id: "o1", order_status: "paid", order_value: 100 }),
      row({ click_id: "c2", campaign_id: "camp1", lead_bound: true }),
      row({ click_id: "c3", campaign_id: "camp2" }),
    ];
    const table = computeCampaignTable(rows, "campaign");
    const camp1 = table.find((t) => t.key === "camp1")!;
    expect(camp1.clicks).toBe(2);
    expect(camp1.leads).toBe(1);
    expect(camp1.purchases).toBe(1);
    expect(camp1.revenue).toBe(100);
  });
});
