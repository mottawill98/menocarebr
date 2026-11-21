import type { Profile } from "@tracking/shared";
import { Badge } from "./ui/badge";
import { LogoutButton } from "./logout-button";

export function Topbar({ profile }: { profile: Profile }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">{profile.email}</span>
        <Badge tone="info">{profile.role}</Badge>
        <LogoutButton />
      </div>
    </header>
  );
}
