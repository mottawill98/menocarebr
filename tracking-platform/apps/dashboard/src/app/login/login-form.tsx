"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();

      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
        });
        if (resetError) setError(resetError.message);
        else setNotice("Se o e-mail existir, enviamos um link de recuperação.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("E-mail ou senha inválidos.");
        return;
      }

      router.replace(nextPath || "/");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>

          {mode === "login" && (
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Enviar link de recuperação"}
          </Button>

          <button
            type="button"
            className="w-full text-center text-xs text-muted hover:text-foreground"
            onClick={() => {
              setMode(mode === "login" ? "forgot" : "login");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
