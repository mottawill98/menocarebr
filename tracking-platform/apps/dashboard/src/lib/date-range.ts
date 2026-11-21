import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns";

const TIMEZONE = "America/Sao_Paulo";

export type DateRangePreset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Calcula o intervalo (em UTC, prontos para consulta no banco) a partir de um preset, com "agora" avaliado em America/Sao_Paulo. */
export function resolveDateRange(preset: DateRangePreset, custom?: { from: string; to: string }): DateRange {
  const nowInTz = toZonedTime(new Date(), TIMEZONE);

  switch (preset) {
    case "today":
      return { from: fromZonedTime(startOfDay(nowInTz), TIMEZONE), to: fromZonedTime(endOfDay(nowInTz), TIMEZONE) };
    case "yesterday": {
      const yesterday = subDays(nowInTz, 1);
      return { from: fromZonedTime(startOfDay(yesterday), TIMEZONE), to: fromZonedTime(endOfDay(yesterday), TIMEZONE) };
    }
    case "7d":
      return { from: fromZonedTime(startOfDay(subDays(nowInTz, 6)), TIMEZONE), to: fromZonedTime(endOfDay(nowInTz), TIMEZONE) };
    case "30d":
      return { from: fromZonedTime(startOfDay(subDays(nowInTz, 29)), TIMEZONE), to: fromZonedTime(endOfDay(nowInTz), TIMEZONE) };
    case "this_month":
      return { from: fromZonedTime(startOfMonth(nowInTz), TIMEZONE), to: fromZonedTime(endOfDay(nowInTz), TIMEZONE) };
    case "custom": {
      if (!custom) throw new Error("Período personalizado exige 'from' e 'to'.");
      // Strings "naive" (sem `Z`/offset): `fromZonedTime` interpreta os
      // componentes literalmente como horário de `TIMEZONE`, sem depender
      // do fuso horário do sistema onde o processo roda (ao contrário de
      // montar um `Date` com `new Date(...)` e só depois converter).
      return {
        from: fromZonedTime(`${custom.from}T00:00:00.000`, TIMEZONE),
        to: fromZonedTime(`${custom.to}T23:59:59.999`, TIMEZONE),
      };
    }
    default:
      throw new Error(`preset de data desconhecido: ${preset satisfies never}`);
  }
}

/** Período imediatamente anterior, de mesma duração — usado para "comparação com período anterior" (item 29). */
export function previousPeriod(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - durationMs), to: new Date(range.from.getTime()) };
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  this_month: "Este mês",
  custom: "Período personalizado",
};
