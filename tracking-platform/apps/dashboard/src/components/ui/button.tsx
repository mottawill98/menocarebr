import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-4 text-sm",
        variant === "primary" && "bg-brand text-brand-foreground hover:bg-brand-hover",
        variant === "secondary" && "border border-border bg-surface text-foreground hover:bg-background",
        variant === "ghost" && "text-foreground hover:bg-background",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className
      )}
      {...props}
    />
  );
}
