"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleRouteActive } from "@/actions/routes";

export function ToggleRouteButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-muted hover:text-foreground disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await toggleRouteActive(id, !active);
          router.refresh();
        });
      }}
    >
      {active ? "Desativar" : "Ativar"}
    </button>
  );
}
