create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  resource_type text not null,
  resource_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Trilha de auditoria de acoes administrativas (usuario criado, rota editada, numero desativado, evento Meta reenviado, etc.).';

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs_read_admin"
  on public.audit_logs for select
  to authenticated
  using (public.current_profile_role() = 'ADMIN');

create table public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  request_id text not null,
  status integer not null,
  duration_ms integer not null,
  result text not null,
  payload_sanitized jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.webhook_logs is 'Log tecnico de cada chamada aos webhooks do CRM. Payload sempre sanitizado — nunca guarda token/authorization.';

create index webhook_logs_created_at_idx on public.webhook_logs (created_at desc);
create index webhook_logs_endpoint_idx on public.webhook_logs (endpoint);

alter table public.webhook_logs enable row level security;

create policy "webhook_logs_read_admin"
  on public.webhook_logs for select
  to authenticated
  using (public.current_profile_role() = 'ADMIN');

create table public.redirect_misses (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  reason text not null check (reason in ('not_found', 'inactive')),
  client_ip_address inet,
  client_user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.redirect_misses is 'Registro de acesso a uma rota inexistente ou inativa — nunca redirecionamos para URL arbitraria nesses casos.';

create index redirect_misses_created_at_idx on public.redirect_misses (created_at desc);
create index redirect_misses_slug_idx on public.redirect_misses (slug);

alter table public.redirect_misses enable row level security;

create policy "redirect_misses_read_admin_manager"
  on public.redirect_misses for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'));
