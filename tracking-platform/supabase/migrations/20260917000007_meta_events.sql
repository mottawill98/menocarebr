create table public.meta_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  order_id uuid not null references public.orders (id),
  click_id uuid references public.clicks (id),
  event_name text not null default 'Purchase',
  event_time timestamptz not null,
  payload_sanitized jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz default now(),
  sent_at timestamptz,
  http_status integer,
  meta_response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meta_events is 'Fila/registro dos eventos enviados a Conversions API. event_id = purchase:<crm_order_id>, com UNIQUE, garante idempotencia mesmo com reenvio do webhook do CRM.';
comment on column public.meta_events.payload_sanitized is 'Corpo enviado a Meta, mas com o access_token removido — nunca persistimos o token aqui.';

create unique index meta_events_event_id_idx on public.meta_events (event_id);
create index meta_events_status_idx on public.meta_events (status);
create index meta_events_order_id_idx on public.meta_events (order_id);
create index meta_events_next_attempt_idx on public.meta_events (next_attempt_at) where status in ('pending', 'failed');

create trigger meta_events_set_updated_at
  before update on public.meta_events
  for each row execute procedure public.set_updated_at();

alter table public.meta_events enable row level security;

create policy "meta_events_read_all_roles"
  on public.meta_events for select
  to authenticated
  using (public.current_profile_role() in ('ADMIN', 'MANAGER', 'VIEWER'));

-- Escrita (criacao, retry, reenvio manual) sempre via service role: o botao
-- "Reenviar" do dashboard chama uma Server Action que valida o role no
-- codigo e so entao usa a service role key para colocar o evento de volta
-- na fila.
