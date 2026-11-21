"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { inviteUser } from "@/actions/users";

export function InviteUserForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await inviteUser({ email: formData.get("email"), role: formData.get("role") });
          if (result.error) setError(result.error);
          else {
            (document.getElementById("invite-form") as HTMLFormElement)?.reset();
            router.refresh();
          }
        });
      }}
      id="invite-form"
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <Input name="email" type="email" required placeholder="email@empresa.com" className="w-64" />
      </div>
      <Select name="role" defaultValue="VIEWER" className="w-32">
        <option value="ADMIN">ADMIN</option>
        <option value="MANAGER">MANAGER</option>
        <option value="VIEWER">VIEWER</option>
      </Select>
      <Button type="submit" disabled={pending}>
        {pending ? "Convidando…" : "Convidar"}
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
