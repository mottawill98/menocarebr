"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ExportCsvButton({ action, filename }: { action: () => Promise<string>; filename: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const csv = await action();
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
        });
      }}
    >
      {pending ? "Exportando…" : "Exportar CSV"}
    </Button>
  );
}
