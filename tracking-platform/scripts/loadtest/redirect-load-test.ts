/**
 * Load test simples do redirect (item 53). Mede o tempo ate o Worker
 * responder o 302 — NUNCA segue o redirect (usa `redirect: "manual"`), entao
 * nenhum wa.me real e tocado, mesmo apontando para produção por engano.
 *
 * Uso:
 *   tsx scripts/loadtest/redirect-load-test.ts <slug> [10,25,50,100]
 *
 * Variaveis de ambiente:
 *   WORKER_URL (default http://localhost:8787)
 */
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8787";
const slug = process.argv[2] ?? "menocare";
const levels = (process.argv[3] ?? "10,25,50,100").split(",").map(Number);

interface RunResult {
  concurrency: number;
  ok: number;
  errors: number;
  latenciesMs: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function runLevel(concurrency: number): Promise<RunResult> {
  const latencies: number[] = [];
  let ok = 0;
  let errors = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const startedAt = performance.now();
      try {
        const res = await fetch(`${WORKER_URL}/r/${slug}?utm_source=loadtest`, { redirect: "manual" });
        latencies.push(performance.now() - startedAt);
        if (res.status === 302 || res.status === 0) ok++;
        else errors++;
      } catch {
        latencies.push(performance.now() - startedAt);
        errors++;
      }
    })
  );

  return { concurrency, ok, errors, latenciesMs: latencies.sort((a, b) => a - b) };
}

async function main() {
  console.log(`Testando ${WORKER_URL}/r/${slug} (redirect nunca seguido — wa.me real jamais e tocado)\n`);

  for (const concurrency of levels) {
    const result = await runLevel(concurrency);
    const p50 = percentile(result.latenciesMs, 50);
    const p95 = percentile(result.latenciesMs, 95);
    const p99 = percentile(result.latenciesMs, 99);

    console.log(
      `concorrência=${result.concurrency.toString().padStart(3)} | ok=${result.ok} erros=${result.errors} | p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms p99=${p99.toFixed(0)}ms`
    );

    if (p95 > 200) {
      console.warn(`  ⚠ p95 acima da meta interna de ~150-200ms (item 4 do briefing).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
