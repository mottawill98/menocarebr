import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "America/Sao_Paulo";

/** Banco guarda tudo em UTC (item 66); a interface sempre mostra em America/Sao_Paulo. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return formatInTimeZone(value, TIMEZONE, "dd/MM/yyyy HH:mm");
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return formatInTimeZone(value, TIMEZONE, "dd/MM/yyyy");
}

export function formatCurrency(value: number | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}
