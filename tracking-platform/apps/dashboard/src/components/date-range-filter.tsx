"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { clsx } from "clsx";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range";

const PRESETS: DateRangePreset[] = ["today", "yesterday", "7d", "30d", "this_month"];

export function DateRangeFilter({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPreset(preset: DateRangePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => setPreset(preset)}
          className={clsx(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            current === preset ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground"
          )}
        >
          {DATE_RANGE_PRESET_LABELS[preset]}
        </button>
      ))}
    </div>
  );
}
