create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  attribution_window_days integer not null default 30 check (attribution_window_days > 0),
  default_currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  send_unmatched_orders_to_meta boolean not null default false,
  crm_status_mapping jsonb not null default '{
    "created": "none",
    "pending": "none",
    "approved": "purchase",
    "paid": "purchase",
    "cancelled": "none",
    "refunded": "none",
    "chargeback": "none"
  }'::jsonb,
  log_retention_days integer not null default 90 check (log_retention_days > 0),
  webhook_secret_mode text not null default 'hmac' check (webhook_secret_mode in ('hmac', 'bearer')),
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Configuracao singleton (id=1) do sistema: janela de atribuicao, currency, timezone, mapeamento de status do CRM, retencao de logs.';

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute procedure public.set_updated_at();

insert into public.app_settings (id) values (1);

alter table public.app_settings enable row level security;

create policy "app_settings_read_admin_manager"
  on public.app_settings for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'));

create policy "app_settings_write_admin"
  on public.app_settings for update
  to authenticated
  using (public.current_profile_role() = 'ADMIN')
  with check (public.current_profile_role() = 'ADMIN');
