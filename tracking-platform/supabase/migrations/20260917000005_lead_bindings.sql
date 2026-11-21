create table public.lead_bindings (
  id uuid primary key default gen_random_uuid(),
  click_id uuid not null references public.clicks (id) unique,
  click_ref text not null,
  phone_hash text not null,
  phone_last4 text not null,
  crm_lead_id text,
  initial_message text,
  bound_at timestamptz not null default now(),
  source text not null default 'crm_message',
  created_at timestamptz not null default now()
);

comment on table public.lead_bindings is 'Liga um clique a um telefone (via phone_hash) assim que a primeira mensagem do CRM contendo #click_ref chega. Um clique so pode ser vinculado a um lead (unique em click_id).';
comment on column public.lead_bindings.initial_message is 'Mensagem inicial, guardada apenas o necessario para auditoria — nao acumulamos historico de conversa.';

create index lead_bindings_phone_hash_idx on public.lead_bindings (phone_hash);
create index lead_bindings_click_id_idx on public.lead_bindings (click_id);

alter table public.lead_bindings enable row level security;

create policy "lead_bindings_read_all_roles"
  on public.lead_bindings for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

-- Escrita exclusiva do Worker via service role (mesmo raciocinio de `clicks`).
