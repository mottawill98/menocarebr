"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resendMetaEventAction } from "@/actions/meta-events";

export function ResendButton({ metaEventId }: { metaEventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="text-right">
      <button
        className="text-brand hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await resendMetaEventAction(metaEventId);
            if (result.error) setError(result.error);
            router.refresh();
          });
        }}
      >
        {pending ? "Reenviando…" : "Reenviar"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
