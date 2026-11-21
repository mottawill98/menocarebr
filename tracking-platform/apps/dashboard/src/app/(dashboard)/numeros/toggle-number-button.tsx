"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleNumberActive } from "@/actions/numbers";

export function ToggleNumberButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-muted hover:text-foreground disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await toggleNumberActive(id, !active);
          router.refresh();
        });
      }}
    >
      {active ? "Desativar" : "Ativar"}
    </button>
  );
}
