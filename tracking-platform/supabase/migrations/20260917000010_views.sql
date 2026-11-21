-- Views de leitura para o dashboard evitar N+1: uma unica query com GROUP BY
-- substitui "buscar clicks, depois pra cada click buscar lead, depois pra
-- cada lead buscar pedido". `security_invoker = true` garante que a RLS das
-- tabelas de origem (clicks/lead_bindings/orders) continua valendo para quem
-- consulta a view — a view em si nao concede nenhum acesso extra.

create view public.click_funnel
with (security_invoker = true)
as
select
  c.id as click_id,
  c.click_ref,
  c.route_id,
  c.whatsapp_number_id,
  c.clicked_at,
  c.utm_source,
  c.utm_medium,
  c.utm_campaign,
  c.campaign_id,
  c.campaign_name,
  c.adset_id,
  c.adset_name,
  c.ad_id,
  c.ad_name,
  c.placement,
  c.lead_bound,
  lb.id as lead_binding_id,
  lb.bound_at as lead_bound_at,
  o.id as order_id,
  o.status as order_status,
  o.value as order_value,
  o.currency as order_currency,
  o.paid_at as order_paid_at,
  o.attribution_method as order_attribution_method
from public.clicks c
left join public.lead_bindings lb on lb.click_id = c.id
left join public.orders o on o.click_id = c.id;

comment on view public.click_funnel is 'Junta click -> lead -> pedido para alimentar funil e tabelas de campanha/adset/anuncio sem N+1.';

-- Cobertura de atribuicao de vendas: quantas orders tem click_id vs unmatched.
create view public.order_attribution_coverage
with (security_invoker = true)
as
select
  date_trunc('day', ordered_at) as day,
  count(*) as total_orders,
  count(*) filter (where attribution_status = 'attributed') as attributed_orders,
  count(*) filter (where attribution_status = 'unmatched') as unmatched_orders
from public.orders
group by 1;

comment on view public.order_attribution_coverage is 'KPI de cobertura de atribuicao de compras (item 63 do briefing).';
