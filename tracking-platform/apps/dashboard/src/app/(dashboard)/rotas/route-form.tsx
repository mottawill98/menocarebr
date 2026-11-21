"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { createRoute, updateRoute } from "@/actions/routes";
import type { WhatsappNumber } from "@tracking/shared";

interface RouteFormProps {
  editingId?: string;
  availableNumbers: WhatsappNumber[];
  initial?: {
    name: string;
    slug: string;
    active: boolean;
    whatsapp_message_template: string;
    distribution_strategy: "weighted" | "round_robin";
    whatsapp_number_ids: string[];
  };
}

export function RouteForm({ editingId, availableNumbers, initial }: RouteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.whatsapp_number_ids ?? []);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const payload = {
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      active: formData.get("active") === "on",
      whatsapp_message_template: String(formData.get("whatsapp_message_template") || ""),
      distribution_strategy: String(formData.get("distribution_strategy") || "weighted") as "weighted" | "round_robin",
      whatsapp_number_ids: selectedIds,
    };

    startTransition(async () => {
      const result = editingId ? await updateRoute(editingId, payload) : await createRoute(payload);
      if (result.error) setError(result.error);
      else {
        router.push("/rotas");
        router.refresh();
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" required defaultValue={initial?.name} placeholder="Menocare - campanha principal" />
      </div>
      <div>
        <Label htmlFor="slug">Slug (/r/&lt;slug&gt;)</Label>
        <Input id="slug" name="slug" required defaultValue={initial?.slug} placeholder="menocare" pattern="[a-z0-9-]+" />
      </div>
      <div>
        <Label htmlFor="whatsapp_message_template">Mensagem do WhatsApp</Label>
        <Textarea
          id="whatsapp_message_template"
          name="whatsapp_message_template"
          rows={4}
          required
          defaultValue={initial?.whatsapp_message_template ?? "Olá, gostaria de saber mais 💜\n#{click_ref}"}
        />
        <p className="mt-1 text-xs text-muted">Variáveis disponíveis: {"{click_ref}"}, {"{campaign_name}"}, {"{ad_name}"}</p>
      </div>
      <div>
        <Label htmlFor="distribution_strategy">Estratégia de distribuição</Label>
        <Select id="distribution_strategy" name="distribution_strategy" defaultValue={initial?.distribution_strategy ?? "weighted"}>
          <option value="weighted">Ponderada (pelo peso de cada número)</option>
          <option value="round_robin">Round-robin (pesos iguais, sem contador distribuído)</option>
        </Select>
      </div>
      <div>
        <Label>Números elegíveis</Label>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {availableNumbers.map((number) => (
            <label key={number.id} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={selectedIds.includes(number.id)}
                onChange={(e) =>
                  setSelectedIds((prev) => (e.target.checked ? [...prev, number.id] : prev.filter((id) => id !== number.id)))
                }
                className="h-4 w-4"
              />
              {number.label} (+{number.phone}, peso {number.weight}) {!number.active && "— inativo"}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="h-4 w-4" />
        Rota ativa
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : editingId ? "Salvar alterações" : "Criar rota"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/rotas")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
