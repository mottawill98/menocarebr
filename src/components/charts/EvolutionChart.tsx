"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatDate } from "@/lib/format";

export interface ChartSeries<T> {
  key: keyof T & string;
  label: string;
  color: string;
  formatter: (v: number | null) => string;
}

export function EvolutionChart<T extends { date: string }>({
  data,
  series,
  height = 220,
}: {
  data: T[];
  series: ChartSeries<T>[];
  height?: number;
}) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-surface text-sm text-ink-muted"
        style={{ height }}
      >
        Sem dados no período selecionado.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDate(v)}
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDate(String(v))}
            formatter={(value, name) => {
              const s = series.find((s) => s.label === name);
              return [s ? s.formatter(value as number) : String(value), name];
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3 px-1">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
