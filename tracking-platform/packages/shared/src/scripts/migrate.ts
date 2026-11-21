import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

/**
 * Runner de migration simples e explicito: le todos os `.sql` de
 * `supabase/migrations`, em ordem alfabetica (por isso o prefixo timestamp
 * no nome do arquivo), e aplica os que ainda nao estao registrados em
 * `public.schema_migrations`.
 *
 * Preferimos isso a depender obrigatoriamente da Supabase CLI: funciona em
 * qualquer ambiente que tenha `DATABASE_URL` (ou `SUPABASE_DB_URL`)
 * apontando para o Postgres do projeto Supabase, inclusive CI.
 *
 * Se voce preferir a Supabase CLI (`supabase db push`), os arquivos em
 * `supabase/migrations` sao 100% compativeis com ela tambem.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Defina DATABASE_URL (ou SUPABASE_DB_URL) apontando para o Postgres do Supabase.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ filename: string }>("select filename from public.schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Aplicando ${file}...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (filename) values ($1)", [file]);
        await client.query("commit");
        appliedCount++;
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Falha ao aplicar ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(
      appliedCount === 0
        ? "Nenhuma migration pendente. Banco ja esta atualizado."
        : `${appliedCount} migration(s) aplicada(s) com sucesso.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
