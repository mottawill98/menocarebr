"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "./ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          router.replace("/login");
          router.refresh();
        });
      }}
    >
      Sair
    </Button>
  );
}
