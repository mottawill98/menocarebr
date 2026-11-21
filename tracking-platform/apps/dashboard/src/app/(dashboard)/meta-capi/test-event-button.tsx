"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendMetaTestEventAction } from "@/actions/meta-events";

export function TestEventButton() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await sendMetaTestEventAction();
            setResult(res.error ? `Erro: ${res.error}` : res.ok ? "Evento de teste enviado com sucesso." : `Falha: ${res.detail}`);
          });
        }}
      >
        {pending ? "Enviando…" : "Enviar evento de teste"}
      </Button>
      {result && <p className="max-w-xs text-right text-xs text-muted">{result}</p>}
    </div>
  );
}
