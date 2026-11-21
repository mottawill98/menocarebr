"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { createNumber, updateNumber } from "@/actions/numbers";

interface NumberFormProps {
  editingId?: string;
  initial?: {
    label: string;
    phone: string;
    active: boolean;
    weight: number;
    group_name: string | null;
    notes: string | null;
  };
}

export function NumberForm({ editingId, initial }: NumberFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const payload = {
      label: String(formData.get("label") || ""),
      phone: String(formData.get("phone") || ""),
      active: formData.get("active") === "on",
      weight: Number(formData.get("weight") || 0),
      group_name: String(formData.get("group_name") || "") || null,
      notes: String(formData.get("notes") || "") || null,
    };

    startTransition(async () => {
      const result = editingId ? await updateNumber(editingId, payload) : await createNumber(payload);
      if (result.error) setError(result.error);
      else {
        router.push("/numeros");
        router.refresh();
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <Label htmlFor="label">Nome amigável</Label>
        <Input id="label" name="label" required defaultValue={initial?.label} placeholder="Atendente 01" />
      </div>
      <div>
        <Label htmlFor="phone">Telefone (com DDD e país)</Label>
        <Input id="phone" name="phone" required defaultValue={initial?.phone} placeholder="55 45 99999-9999" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="weight">Peso na distribuição</Label>
          <Input id="weight" name="weight" type="number" min={0} max={1000} required defaultValue={initial?.weight ?? 10} />
        </div>
        <div>
          <Label htmlFor="group_name">Grupo</Label>
          <Input id="group_name" name="group_name" defaultValue={initial?.group_name ?? ""} placeholder="menocare" />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="h-4 w-4" />
        Número ativo
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : editingId ? "Salvar alterações" : "Criar número"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/numeros")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
