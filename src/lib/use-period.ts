"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DEFAULT_PERIOD, PERIOD_KEYS, type PeriodKey } from "./periods";

/**
 * Período selecionado, sincronizado via `?period=` na URL — assim o cabeçalho
 * (fora da árvore da página) e qualquer página/rota mostram sempre o mesmo
 * período, e o valor sobrevive a navegação/refresh.
 */
export function usePeriod(): [PeriodKey, (next: PeriodKey) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("period");
  const period: PeriodKey = (PERIOD_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as PeriodKey)
    : DEFAULT_PERIOD;

  function setPeriod(next: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return [period, setPeriod];
}
