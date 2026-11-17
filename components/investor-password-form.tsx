"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Props = { mode: "invite" | "reset"; inviteToken?: string };

export function InvestorPasswordForm({ mode, inviteToken = "" }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [ready, setReady] = useState(Boolean(inviteToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (inviteToken) return;
    let mounted = true;
    async function check() {
      for (let i = 0; i < 20; i += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (mounted) setReady(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (mounted) {
        setError(
          "O link expirou ou já foi utilizado. Solicite um novo acesso à administração.",
        );
      }
    }
    void check();
    return () => {
      mounted = false;
    };
  }, [inviteToken, supabase]);

  async function acceptWhatsAppInvite() {
    const response = await fetch("/api/investor/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken, password }),
    });
    const payload = (await response.json()) as { email?: string; error?: string };
    if (!response.ok || !payload.email) {
      throw new Error(payload.error || "Não foi possível aceitar o convite.");
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password,
    });
    if (loginError) {
      throw new Error(
        "Sua senha foi criada, mas não foi possível entrar automaticamente. Abra o Portal do Investidor e entre com seu e-mail e a nova senha.",
      );
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== repeat) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "invite" && inviteToken) {
        await acceptWhatsAppInvite();
      } else {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          throw new Error(updateError.message || "Não foi possível salvar a senha.");
        }

        if (mode === "invite") {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) throw new Error("Sua sessão expirou. Abra novamente o link do convite.");
          const response = await fetch("/api/investor/activate", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = (await response.json()) as { error?: string };
          if (!response.ok) {
            throw new Error(payload.error || "Não foi possível ativar o portal.");
          }
        }
      }

      router.replace("/investidor");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Erro ao criar sua senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="investor-password-page">
      <form className="investor-password-card" onSubmit={submit}>
        <div className="investor-password-brand">
          <strong>A&amp;C</strong>
          <span>PORTAL DO INVESTIDOR</span>
        </div>
        <h1>{mode === "invite" ? "Crie sua senha" : "Nova senha"}</h1>
        <p>
          {mode === "invite"
            ? inviteToken
              ? "Este é seu convite individual. Crie a senha que você usará para entrar no Portal do Investidor."
              : "Finalize seu convite. Depois disso, você entrará pelo Portal do Investidor."
            : "Defina uma nova senha para voltar ao Portal do Investidor."}
        </p>
        {inviteToken ? (
          <div className="investor-password-info">
            O link é de uso único. Depois que a senha for criada, ele deixa de funcionar.
          </div>
        ) : null}
        {error && <div className="investor-password-error">{error}</div>}
        <label>
          Senha
          <input
            type={showPassword ? "text" : "password"}
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready || saving}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repita a senha
          <input
            type={showPassword ? "text" : "password"}
            minLength={8}
            maxLength={128}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            disabled={!ready || saving}
            autoComplete="new-password"
          />
        </label>
        <label className="investor-password-show">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} disabled={!ready || saving} />
          Mostrar senha
        </label>
        {mode === "reset" ? (
          <div className="investor-password-info">Se esta conta também for administrativa, a nova senha será a mesma para o painel Admin e para o Portal do Investidor.</div>
        ) : null}
        <button disabled={!ready || saving}>
          {saving ? "Salvando..." : ready ? "Salvar e entrar" : "Validando link..."}
        </button>
      </form>
      <style jsx global>{`
        .investor-password-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f1ec;font-family:Arial,sans-serif}
        .investor-password-card{width:min(440px,100%);display:grid;gap:16px;background:#fff;border:1px solid #ded9d1;padding:34px}
        .investor-password-brand{display:flex;gap:9px;align-items:baseline}
        .investor-password-brand strong{font:700 34px Georgia,serif}.investor-password-brand span{font-size:8px;letter-spacing:.25em}
        .investor-password-card h1{font:500 40px Georgia,serif;margin:0}.investor-password-card p{color:#6b665f;line-height:1.6;margin:0}
        .investor-password-card label{display:grid;gap:7px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
        .investor-password-card input{padding:13px;border:1px solid #d9d3ca}.investor-password-card button{border:0;background:#111;color:#fff;padding:14px;font-weight:700}
        .investor-password-error{background:#fff0f0;color:#962222;padding:11px;font-size:12px}.investor-password-info{background:#f5efe6;color:#665a49;padding:11px;font-size:12px;line-height:1.5}.investor-password-show{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px!important;font-size:12px!important;text-transform:none!important;letter-spacing:0!important}.investor-password-show input{width:auto;padding:0}
      `}</style>
    </main>
  );
}
