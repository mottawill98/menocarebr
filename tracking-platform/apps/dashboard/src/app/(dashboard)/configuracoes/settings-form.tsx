"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { updateSettings } from "@/actions/settings";
import type { AppSettings } from "@tracking/shared";

const CRM_STATUSES = ["created", "pending", "approved", "paid", "cancelled", "refunded", "chargeback"];

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mapping, setMapping] = useState<Record<string, "purchase" | "none">>(initial.crm_status_mapping);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    const payload = {
      attribution_window_days: Number(formData.get("attribution_window_days")),
      default_currency: String(formData.get("default_currency") || "BRL"),
      timezone: String(formData.get("timezone") || "America/Sao_Paulo"),
      send_unmatched_orders_to_meta: formData.get("send_unmatched_orders_to_meta") === "on",
      log_retention_days: Number(formData.get("log_retention_days")),
      webhook_secret_mode: String(formData.get("webhook_secret_mode") || "hmac") as "hmac" | "bearer",
      crm_status_mapping: mapping,
    };

    startTransition(async () => {
      const result = await updateSettings(payload);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="attribution_window_days">Janela de atribuição (dias)</Label>
          <Input id="attribution_window_days" name="attribution_window_days" type="number" min={1} max={365} defaultValue={initial.attribution_window_days} />
        </div>
        <div>
          <Label htmlFor="default_currency">Moeda padrão</Label>
          <Input id="default_currency" name="default_currency" defaultValue={initial.default_currency} maxLength={3} />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={initial.timezone} />
        </div>
        <div>
          <Label htmlFor="log_retention_days">Retenção de logs (dias)</Label>
          <Input id="log_retention_days" name="log_retention_days" type="number" min={1} defaultValue={initial.log_retention_days} />
        </div>
        <div>
          <Label htmlFor="webhook_secret_mode">Modo de segredo do webhook</Label>
          <Select id="webhook_secret_mode" name="webhook_secret_mode" defaultValue={initial.webhook_secret_mode}>
            <option value="hmac">HMAC SHA-256 (recomendado)</option>
            <option value="bearer">Bearer token (fallback)</option>
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="send_unmatched_orders_to_meta" defaultChecked={initial.send_unmatched_orders_to_meta} className="h-4 w-4" />
        Enviar compras sem atribuição para a Meta (usando telefone hasheado, quando disponível)
      </label>

      <div>
        <Label>Mapeamento de status do CRM → evento Meta</Label>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
          {CRM_STATUSES.map((status) => (
            <div key={status} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{status}</span>
              <Select
                className="h-8 w-32"
                value={mapping[status] ?? "none"}
                onChange={(e) => setMapping((prev) => ({ ...prev, [status]: e.target.value as "purchase" | "none" }))}
              >
                <option value="none">Nenhum evento</option>
                <option value="purchase">Purchase</option>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Configurações salvas.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar configurações"}
      </Button>
    </form>
  );
}
