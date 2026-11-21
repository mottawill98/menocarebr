create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'VIEWER' check (role in ('ADMIN', 'MANAGER', 'VIEWER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil + papel (RBAC) de cada usuario do Supabase Auth.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Cria automaticamente um profile (papel VIEWER por padrao) para todo novo
-- usuario do Supabase Auth. O primeiro ADMIN precisa ser promovido
-- manualmente (ver docs/DEPLOY.md) — nunca assumimos que o primeiro
-- cadastro e confiavel como admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'VIEWER')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Funcao auxiliar usada pelas policies de RLS de todo o schema. SECURITY
-- DEFINER + search_path fixo evita tanto recursao de RLS (a policy de
-- `profiles` nao pode depender de uma subquery sujeita a RLS de `profiles`)
-- quanto hijacking de search_path.
create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_profile_role() = 'ADMIN');

create policy "profiles_update_own_row"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_manage"
  on public.profiles for all
  to authenticated
  using (public.current_profile_role() = 'ADMIN')
  with check (public.current_profile_role() = 'ADMIN');

-- Trigger de reforco: mesmo que uma policy de UPDATE permita a linha
-- passar, ninguem alem de um ADMIN pode mudar o proprio `role` (evita
-- auto-promocao). Isso roda independente de qual policy autorizou o
-- UPDATE, entao nao depende de subquery auto-referenciada na policy.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.current_profile_role() <> 'ADMIN' then
    raise exception 'apenas ADMIN pode alterar o role de um usuario';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute procedure public.guard_profile_role_change();
