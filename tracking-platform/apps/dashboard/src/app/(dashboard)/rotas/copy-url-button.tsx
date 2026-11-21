"use client";

import { useState } from "react";

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="text-brand hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copiado!" : "Copiar URL"}
    </button>
  );
}
