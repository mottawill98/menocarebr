create table public.clicks (
  id uuid primary key default gen_random_uuid(),
  click_ref text not null unique,
  route_id uuid not null references public.routes (id),
  whatsapp_number_id uuid not null references public.whatsapp_numbers (id),
  clicked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  fbclid text,
  fbc text,
  fbp text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  placement text,
  referrer text,
  client_user_agent text,
  client_ip_address inet,
  extra_params jsonb not null default '{}'::jsonb,
  lead_bound boolean not null default false,
  lead_bound_at timestamptz
);

comment on table public.clicks is 'Um clique de redirect /r/<slug> -> wa.me. click_ref e a chave que substitui o ctwa_clid que nao existe (numeros sem WABA).';
comment on column public.clicks.fbp is 'So preenchido se um _fbp legitimo do browser existir; nunca inventado.';

create unique index clicks_click_ref_idx on public.clicks (click_ref);
create index clicks_clicked_at_idx on public.clicks (clicked_at desc);
create index clicks_campaign_id_idx on public.clicks (campaign_id);
create index clicks_adset_id_idx on public.clicks (adset_id);
create index clicks_ad_id_idx on public.clicks (ad_id);
create index clicks_route_id_idx on public.clicks (route_id);
create index clicks_whatsapp_number_id_idx on public.clicks (whatsapp_number_id);

alter table public.clicks enable row level security;

create policy "clicks_read_all_roles"
  on public.clicks for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

-- Sem policies de INSERT/UPDATE/DELETE para `authenticated`: a unica escrita
-- legitima vem do Worker (Cloudflare Queue consumer) usando a service role
-- key, que ignora RLS por definicao. Isso garante que nenhum usuario
-- logado no dashboard — nem ADMIN — consiga fabricar ou editar um clique
-- diretamente pelo client Supabase.

create table public.pending_lead_bindings (
  id uuid primary key default gen_random_uuid(),
  click_ref text not null,
  phone_hash text not null,
  phone_last4 text not null,
  initial_message text,
  crm_conversation_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.pending_lead_bindings is 'Reconciliacao: mensagem do CRM chegou com um click_ref que ainda nao foi persistido (condicao de corrida da fila). Resolvido de forma orientada a evento pelo consumer de clicks, com varredura periodica de fallback.';

create index pending_lead_bindings_click_ref_idx on public.pending_lead_bindings (click_ref) where not resolved;
create index pending_lead_bindings_next_attempt_idx on public.pending_lead_bindings (next_attempt_at) where not resolved;

alter table public.pending_lead_bindings enable row level security;

create policy "pending_lead_bindings_read_admin_manager"
  on public.pending_lead_bindings for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'));
