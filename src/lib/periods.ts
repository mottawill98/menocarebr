/**
 * Períodos de análise suportados pela dashboard. Cada um mapeia para um
 * `date_preset` nativo da Graph API — os agregados (spend, reach, ctr, etc.)
 * vêm sempre deduplicados pela própria Meta, nunca recalculados aqui.
 * Módulo sem dependências de Node (fs/process) para poder ser importado
 * tanto em Server Components/rotas quanto em Client Components.
 */
export const PERIOD_KEYS = ["today", "yesterday", "d3", "d7", "d14", "d30", "max"] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_PRESETS: Record<PeriodKey, string> = {
  today: "today",
  yesterday: "yesterday",
  d3: "last_3d",
  d7: "last_7d",
  d14: "last_14d",
  d30: "last_30d",
  max: "maximum",
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  d3: "Últimos 3 dias",
  d7: "Últimos 7 dias",
  d14: "Últimos 14 dias",
  d30: "Últimos 30 dias",
  max: "Máximo",
};

/**
 * Quantos dias cada período cobre — usado para fatiar a série diária (gráficos)
 * e para calcular a tendência (período atual vs. imediatamente anterior).
 * `null` para "max": não existe um "período anterior" equivalente para comparar.
 */
export const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  today: 1,
  yesterday: 1,
  d3: 3,
  d7: 7,
  d14: 14,
  d30: 30,
  max: null,
};

/** Deslocamento (em dias, antes de `until`) de onde o período começa a contar. */
export const PERIOD_ANCHOR_OFFSET: Record<PeriodKey, number> = {
  today: 0,
  yesterday: 1,
  d3: 0,
  d7: 0,
  d14: 0,
  d30: 0,
  max: 0,
};

export const DEFAULT_PERIOD: PeriodKey = "d7";
