"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AdminAccountSetup({ mode }: { mode: "invite" | "reset" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const code = searchParams.get("code");
        if (code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
        }
        const session = await supabase.auth.getSession();
        if (session.error || !session.data.session) throw new Error("O link expirou ou já foi utilizado.");
        if (!cancelled) {
          setDisplayName(String(session.data.session.user.user_metadata?.display_name || ""));
          setReady(true);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "O link não é válido.");
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, supabase]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 12) return setError("A senha precisa ter pelo menos 12 caracteres.");
    if (password !== confirmation) return setError("As senhas não são iguais.");
    if (mode === "invite" && displayName.trim().length < 2) return setError("Informe seu nome.");
    setLoading(true);
    setError("");
    try {
      const updated = await supabase.auth.updateUser({ password, data: displayName.trim() ? { display_name: displayName.trim() } : undefined });
      if (updated.error) throw updated.error;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("A confirmação expirou. Abra novamente o link do e-mail.");
      const response = await fetch("/api/admin/account/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mode, displayName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      await supabase.auth.signOut();
      router.replace("/admin/login?conta=pronta");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="admin-login-card" onSubmit={submit}>
    <div className="admin-login-brand"><strong>A&C</strong><span>CONTA SEGURA</span></div>
    <span className="eyebrow">{mode === "invite" ? "ACEITAR CONVITE" : "REDEFINIR SENHA"}</span>
    <h1>{mode === "invite" ? "Crie seu acesso" : "Escolha uma nova senha"}</h1>
    <p>{mode === "invite" ? "Depois de definir sua senha, o painel solicitará a configuração do aplicativo autenticador." : "A nova senha encerrará as sessões administrativas anteriores."}</p>
    {!ready && !error && <div className="mfa-loading">Validando o link seguro…</div>}
    {mode === "invite" && <label>Seu nome<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!ready} required /></label>}
    <label>Nova senha<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready} minLength={12} required /></label>
    <label>Confirme a senha<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!ready} minLength={12} required /></label>
    {error && <div className="form-error">{error}</div>}
    <button className="button button-dark button-full" disabled={!ready || loading}>{loading ? "Salvando…" : mode === "invite" ? "Ativar minha conta" : "Alterar minha senha"}</button>
    <small>Use uma senha exclusiva, longa e diferente das redes sociais e do e-mail.</small>
  </form>;
}
