"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  MessageCircle,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Power,
} from "lucide-react";
import type { WhatsappNumber, RedirectConfig } from "@/lib/redirect/store";

type MaskedConfig = RedirectConfig & { hasToken: boolean };

function formatPhone(phone: string): string {
  // Formata "5511999999999" como "+55 (11) 99999-9999" quando possível; caso
  // contrário, exibe os dígitos crus para não esconder um número mal digitado.
  const match = phone.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return phone;
  const [, country, ddd, first, last] = match;
  return `+${country} (${ddd}) ${first}-${last}`;
}

/** `path` é o caminho relativo (ex: "/r/abc123"); a origem só existe no navegador,
 * então é resolvida no momento do clique — evita divergência entre o HTML
 * renderizado no servidor e a primeira renderização no cliente. */
function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sem permissão de clipboard — ignora silenciosamente, o link já está visível.
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-page"
      title={path}
    >
      {copied ? <Check size={13} className="text-status-good" /> : <Copy size={13} />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}

export function WhatsappRedirectDashboard({
  initialNumbers,
  initialConfig,
}: {
  initialNumbers: WhatsappNumber[];
  initialConfig: MaskedConfig;
}) {
  const [numbers, setNumbers] = useState(initialNumbers);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink">Redirect para WhatsApp</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Use o link único abaixo nos anúncios/bio — ele mostra uma tela de carregamento e distribui os cliques em
          rodízio entre todos os números ativos, pra não sobrecarregar um único atendimento. Cada número também tem
          um link direto próprio, caso precise apontar para um atendente específico.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Link principal (rodízio)</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Esse é o link para usar nos anúncios. Cada clique vai para o próximo número ativo da lista, em sequência.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">/r</code>
          <CopyLinkButton path="/r" />
        </div>
      </section>

      <PixelConfigSection initialConfig={initialConfig} />

      <NumbersSection numbers={numbers} setNumbers={setNumbers} />
    </div>
  );
}

function PixelConfigSection({ initialConfig }: { initialConfig: MaskedConfig }) {
  const [pixelId, setPixelId] = useState(initialConfig.pixelId);
  const [pixelToken, setPixelToken] = useState(initialConfig.pixelToken);
  const [tokenTouched, setTokenTouched] = useState(false);
  const [eventName, setEventName] = useState(initialConfig.eventName || "Contact");
  const [testEventCode, setTestEventCode] = useState(initialConfig.testEventCode);
  const [defaultMessage, setDefaultMessage] = useState(initialConfig.defaultMessage);
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(initialConfig.hasToken);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/redirect/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixelId,
          // Só manda o token se o usuário de fato digitou um novo valor.
          pixelToken: tokenTouched ? pixelToken : undefined,
          eventName,
          testEventCode,
          defaultMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao salvar.");
      setHasToken(json.config.hasToken);
      setPixelToken(json.config.pixelToken);
      setTokenTouched(false);
      setFeedback({ ok: true, message: "Configuração salva." });
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Pixel do Facebook</h2>
      <p className="mt-1 text-xs text-ink-muted">
        O ID do pixel e o token de acesso são usados para enviar os eventos server-side (Conversions API). O token
        nunca é exibido depois de salvo.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">ID do pixel</span>
          <input
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="Ex: 123456789012345"
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Token de acesso (CAPI)</span>
          <div className="flex gap-2">
            <input
              type={showToken ? "text" : "password"}
              value={pixelToken}
              onChange={(e) => {
                setPixelToken(e.target.value);
                setTokenTouched(true);
              }}
              placeholder={hasToken ? "Token salvo — digite para substituir" : "Cole o token de acesso"}
              className="min-w-0 flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="shrink-0 rounded-lg border border-border bg-page px-2.5 text-ink-muted hover:text-ink"
              title={showToken ? "Ocultar" : "Mostrar"}
            >
              {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Nome do evento</span>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Contact"
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">
            Código de teste <span className="text-ink-muted">(opcional)</span>
          </span>
          <input
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            placeholder="Ex: TEST12345 — do Gerenciador de Eventos"
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-ink">
            Mensagem padrão do link principal <span className="text-ink-muted">(opcional)</span>
          </span>
          <input
            value={defaultMessage}
            onChange={(e) => setDefaultMessage(e.target.value)}
            placeholder="Ex: Olá! Vim pelo anúncio e gostaria de continuar minha consulta."
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-page px-3 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
        {feedback && (
          <span className={`text-xs ${feedback.ok ? "text-status-good" : "text-status-critical"}`}>
            {feedback.message}
          </span>
        )}
      </div>
    </section>
  );
}

function NumbersSection({
  numbers,
  setNumbers,
}: {
  numbers: WhatsappNumber[];
  setNumbers: React.Dispatch<React.SetStateAction<WhatsappNumber[]>>;
}) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    if (!phone.trim()) {
      setError("Preencha o número.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/redirect/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, phone, message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao adicionar número.");
      setNumbers((prev) => [...prev, json.number]);
      setLabel("");
      setPhone("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar número.");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleActive(number: WhatsappNumber) {
    setPendingId(number.id);
    try {
      const res = await fetch(`/api/redirect/numbers/${number.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !number.active }),
      });
      const json = await res.json();
      if (res.ok) {
        setNumbers((prev) => prev.map((n) => (n.id === number.id ? json.number : n)));
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/redirect/numbers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNumbers((prev) => prev.filter((n) => n.id !== id));
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Números de WhatsApp</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Todo número ativo entra no rodízio do link principal. Desative um número pra tirá-lo da fila sem perder o
        cadastro.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">
            Nome <span className="text-ink-muted">(opcional)</span>
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Atendente 1"
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Número (com DDI e DDD)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ex: 5511999999999"
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">
            Mensagem inicial <span className="text-ink-muted">(opcional)</span>
          </span>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex: Olá! Vim do anúncio e quero saber mais."
            className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </label>
        <button
          onClick={handleAdd}
          disabled={adding}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-page px-3 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-status-critical">{error}</p>}

      <div className="mt-5 flex flex-col divide-y divide-border">
        {numbers.length === 0 && (
          <p className="py-4 text-sm text-ink-muted">Nenhum número cadastrado ainda.</p>
        )}
        {numbers.map((number) => {
          const path = `/r/${number.id}`;
          const busy = pendingId === number.id;
          return (
            <div key={number.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    number.active ? "bg-status-good/10 text-status-good" : "bg-ink-muted/10 text-ink-muted"
                  }`}
                >
                  <MessageCircle size={15} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">
                    {number.label || formatPhone(number.phone)}
                    {!number.active && <span className="ml-2 text-xs font-normal text-ink-muted">(inativo)</span>}
                  </div>
                  <div className="truncate text-xs text-ink-muted">
                    {number.label ? `${formatPhone(number.phone)} · ` : ""}
                    <code className="text-[11px]">{path}</code>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <CopyLinkButton path={path} />
                <button
                  onClick={() => handleToggleActive(number)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-page px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-60"
                  title={number.active ? "Desativar link" : "Ativar link"}
                >
                  <Power size={13} />
                  {number.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  onClick={() => handleDelete(number.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-page px-2.5 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
