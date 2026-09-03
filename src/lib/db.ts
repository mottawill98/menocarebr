import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Variável de ambiente DATABASE_URL ausente. Configure a integração Neon no Vercel (ou rode " +
        "`npx vercel env pull .env.local` para trazer o valor pro ambiente local)."
    );
  }
  return url;
}

let sqlInstance: NeonQueryFunction<false, false> | null = null;

function sql(): NeonQueryFunction<false, false> {
  if (!sqlInstance) sqlInstance = neon(getConnectionString());
  return sqlInstance;
}

let schemaReady: Promise<void> | null = null;

/**
 * Garante que as tabelas existam antes de qualquer leitura/escrita. Cacheada
 * num singleton por instância de servidor — roda só uma vez por cold start,
 * não a cada requisição.
 */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = sql();
      await db`
        create table if not exists app_data (
          key text primary key,
          value jsonb not null,
          updated_at timestamptz not null default now()
        )
      `;
      await db`
        create table if not exists redirect_rotation (
          id text primary key,
          cursor bigint not null default 0
        )
      `;
    })();
  }
  return schemaReady;
}

/** Armazenamento chave-valor genérico — cada chave corresponde a um antigo arquivo JSON. */
export async function getJson<T>(key: string): Promise<T | null> {
  await ensureSchema();
  const rows = await sql()`select value from app_data where key = ${key}`;
  return rows.length ? (rows[0].value as T) : null;
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await ensureSchema();
  await sql()`
    insert into app_data (key, value, updated_at)
    values (${key}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function deleteJson(key: string): Promise<void> {
  await ensureSchema();
  await sql()`delete from app_data where key = ${key}`;
}

/**
 * Avança um contador atômico e retorna o índice (0-based, com módulo de
 * `poolSize`) a usar — a base do rodízio entre números de WhatsApp.
 * O `on conflict do update` garante que requisições concorrentes nunca
 * peguem o mesmo valor de cursor.
 */
export async function nextRotationIndex(id: string, poolSize: number): Promise<number> {
  if (poolSize <= 0) return 0;
  await ensureSchema();
  const rows = await sql()`
    insert into redirect_rotation (id, cursor) values (${id}, 0)
    on conflict (id) do update set cursor = redirect_rotation.cursor + 1
    returning cursor
  `;
  const cursor = Number(rows[0].cursor);
  return cursor % poolSize;
}
