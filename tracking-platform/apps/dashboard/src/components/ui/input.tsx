import { clsx } from "clsx";
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("mb-1 block text-xs font-medium text-muted", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand",
        className
      )}
      {...props}
    />
  );
}
