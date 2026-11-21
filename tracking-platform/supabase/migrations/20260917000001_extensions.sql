-- Extensoes necessarias: uuid v4/v7 e criptografia (nao usada diretamente
-- nas migrations, mas mantida disponivel para funcoes futuras).
create extension if not exists pgcrypto;

-- Funcao generica de trigger para manter `updated_at` sempre correto.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
