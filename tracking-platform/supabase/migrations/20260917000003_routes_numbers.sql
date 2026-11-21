create table public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  phone text not null unique,
  active boolean not null default true,
  weight integer not null default 10 check (weight >= 0),
  group_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.whatsapp_numbers.phone is 'E.164 sem sinal de +, apenas digitos (ex.: 5545999999999).';

create trigger whatsapp_numbers_set_updated_at
  before update on public.whatsapp_numbers
  for each row execute procedure public.set_updated_at();

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  whatsapp_message_template text not null default $$Olá, gostaria de saber mais 💜
#{click_ref}$$,
  distribution_strategy text not null default 'weighted' check (distribution_strategy in ('weighted', 'round_robin')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.routes is 'Rota de redirect (/r/<slug>): mensagem, estrategia de distribuicao e grupo de numeros.';

create trigger routes_set_updated_at
  before update on public.routes
  for each row execute procedure public.set_updated_at();

-- slug so pode ter letras minusculas, digitos e hifen — evita ambiguidade de
-- URL e problemas de encoding.
alter table public.routes
  add constraint routes_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$');

create table public.route_numbers (
  route_id uuid not null references public.routes (id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers (id) on delete cascade,
  primary key (route_id, whatsapp_number_id)
);

comment on table public.route_numbers is 'Grupo de numeros elegiveis para distribuicao dentro de uma rota (N:N).';

create index route_numbers_number_idx on public.route_numbers (whatsapp_number_id);

alter table public.whatsapp_numbers enable row level security;
alter table public.routes enable row level security;
alter table public.route_numbers enable row level security;

create policy "routes_read_all_roles"
  on public.routes for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

create policy "routes_write_admin_manager"
  on public.routes for all
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'))
  with check (public.current_profile_role() in ('ADMIN', 'MANAGER'));

create policy "whatsapp_numbers_read_all_roles"
  on public.whatsapp_numbers for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

create policy "whatsapp_numbers_write_admin_manager"
  on public.whatsapp_numbers for all
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'))
  with check (public.current_profile_role() in ('ADMIN', 'MANAGER'));

create policy "route_numbers_read_all_roles"
  on public.route_numbers for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

create policy "route_numbers_write_admin_manager"
  on public.route_numbers for all
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER'))
  with check (public.current_profile_role() in ('ADMIN', 'MANAGER'));
