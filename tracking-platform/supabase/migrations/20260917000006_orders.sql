create table public.orders (
  id uuid primary key default gen_random_uuid(),
  crm_order_id text not null unique,
  phone_hash text,
  phone_last4 text,
  click_id uuid references public.clicks (id),
  click_ref text,
  status text not null default 'unknown'
    check (status in ('pending', 'created', 'approved', 'paid', 'cancelled', 'refunded', 'chargeback', 'unknown')),
  raw_status text not null,
  value numeric(12, 2) not null default 0 check (value >= 0),
  currency text not null default 'BRL',
  seller text,
  ordered_at timestamptz not null default now(),
  paid_at timestamptz,
  attribution_status text not null default 'unmatched' check (attribution_status in ('attributed', 'unmatched')),
  attribution_method text not null default 'unmatched' check (attribution_method in ('click_ref', 'phone_hash', 'unmatched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb
);

comment on table public.orders is 'Pedido/venda normalizado a partir do webhook do CRM. Nunca inventamos atribuicao: attribution_method = unmatched quando nao ha click_ref nem phone_hash conhecido.';
comment on column public.orders.raw_metadata is 'Payload do CRM ja sanitizado (sem tokens/segredos) — ver sanitizeMetadata em packages/shared.';

create unique index orders_crm_order_id_idx on public.orders (crm_order_id);
create index orders_phone_hash_idx on public.orders (phone_hash);
create index orders_click_id_idx on public.orders (click_id);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_attribution_status_idx on public.orders (attribution_status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();

alter table public.orders enable row level security;

create policy "orders_read_all_roles"
  on public.orders for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

-- Escrita exclusiva do Worker (webhook de pedido) via service role.
