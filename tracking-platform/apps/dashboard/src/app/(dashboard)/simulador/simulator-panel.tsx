"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { simulateClick, simulateCrmMessage, simulateOrder, processMetaForOrder } from "@/actions/simulator";

const FAKE_PHONE = "5599999" + Math.floor(100000 + Math.random() * 800000);

export function SimulatorPanel({ defaultSlug }: { defaultSlug: string }) {
  const [slug, setSlug] = useState(defaultSlug);
  const [log, setLog] = useState<string[]>([]);
  const [clickRef, setClickRef] = useState<string | null>(null);
  const [crmOrderId, setCrmOrderId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function appendLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString("pt-BR")} — ${line}`]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simular fluxo completo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="slug">Slug da rota</Label>
          <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="max-w-xs" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await simulateClick(slug);
                if (!result.ok) return appendLog(`Erro ao gerar clique: ${result.error}`);
                setClickRef(result.clickRef!);
                appendLog(`Clique gerado. click_ref=${result.clickRef}, wa.me: ${result.waUrl}`);
              })
            }
          >
            1. Gerar click
          </Button>
          <Button
            disabled={pending || !clickRef}
            onClick={() =>
              startTransition(async () => {
                const result = await simulateCrmMessage(clickRef!, FAKE_PHONE);
                appendLog(result.ok ? "Mensagem CRM simulada com sucesso." : `Erro: ${result.error}`);
              })
            }
          >
            2. Simular mensagem CRM
          </Button>
          <Button
            disabled={pending || !clickRef}
            onClick={() =>
              startTransition(async () => {
                const result = await simulateOrder(FAKE_PHONE, clickRef!);
                if (result.ok) setCrmOrderId(result.crmOrderId!);
                appendLog(result.ok ? `Pedido simulado: ${result.crmOrderId}` : `Erro: ${result.error}`);
              })
            }
          >
            3. Simular pedido
          </Button>
          <Button
            disabled={pending || !crmOrderId}
            onClick={() =>
              startTransition(async () => {
                const result = await processMetaForOrder(crmOrderId!);
                appendLog(result.ok ? `Evento Meta processado. status=${result.status}` : `Erro: ${result.error}`);
              })
            }
          >
            4. Processar Meta
          </Button>
        </div>

        <div className="rounded-md border border-border bg-background p-3 font-mono text-xs text-muted">
          {log.length === 0 ? "Nenhuma ação executada ainda." : log.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </CardContent>
    </Card>
  );
}
