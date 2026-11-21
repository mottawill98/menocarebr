import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary";

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
        variant === "primary" && "bg-brand text-brand-foreground hover:bg-brand-hover",
        variant === "secondary" && "border border-border bg-surface text-foreground hover:bg-background",
        className
      )}
      {...props}
    />
  );
}
