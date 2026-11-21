"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";
import { updateUserRole } from "@/actions/users";
import type { ProfileRole } from "@tracking/shared";

export function RoleSelect({ userId, role, disabled }: { userId: string; role: ProfileRole; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={role}
      disabled={disabled || pending}
      className="h-8 w-32"
      onChange={(e) => {
        const newRole = e.target.value as ProfileRole;
        startTransition(async () => {
          await updateUserRole(userId, newRole);
          router.refresh();
        });
      }}
    >
      <option value="ADMIN">ADMIN</option>
      <option value="MANAGER">MANAGER</option>
      <option value="VIEWER">VIEWER</option>
    </Select>
  );
}
