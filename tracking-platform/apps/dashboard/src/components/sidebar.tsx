"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { NavItem } from "@/lib/nav-items";

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="h-6 w-6 rounded bg-brand" aria-hidden />
        <span className="text-sm font-semibold text-foreground">Menocare Tracking</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand text-brand-foreground" : "text-foreground hover:bg-background"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
