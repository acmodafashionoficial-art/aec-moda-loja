"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Enrollment = { qrCode: string; secret: string };

export function AdminMfaForm({ mode, email }: { mode: "enroll" | "challenge"; email: string }) {
  const router = useRouter();
  const enrollmentStarted = useRef(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "enroll");

  useEffect(() => {
    if (mode !== "enroll" || enrollmentStarted.current) return;
    // No desenvolvimento, o React executa efeitos duas vezes para detectar efeitos colaterais.
    // Esta trava evita criar dois fatores TOTP simultaneamente no Supabase.
    enrollmentStarted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/mfa/enroll", { method: "POST" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível gerar o QR Code.");
        if (!cancelled) setEnrollment({ qrCode: result.qrCode, secret: result.secret });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível configurar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Código inválido.");
      router.replace(result.next || "/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Código inválido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-login-card admin-mfa-card" onSubmit={submit}>
      <div className="admin-login-brand"><strong>A&C</strong><span>SEGURANÇA</span></div>
      <span className="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span>
      <h1>{mode === "enroll" ? "Proteja sua conta" : "Confirme seu acesso"}</h1>
      <p>{mode === "enroll" ? "Abra Google Authenticator, Microsoft Authenticator ou outro aplicativo compatível e escaneie o QR Code." : `Digite o código de 6 números da conta ${email}.`}</p>
      {mode === "enroll" && loading && <div className="mfa-loading">Gerando configuração segura…</div>}
      {mode === "enroll" && enrollment && <div className="mfa-enrollment">
        {/* O QR Code é fornecido pelo Supabase Auth como data URL segura. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- QR Code temporário retornado como data URL pelo Supabase Auth. */}
        <img src={enrollment.qrCode} alt="QR Code para ativar autenticação em duas etapas" />
        <div><small>Não conseguiu escanear? Digite esta chave no aplicativo:</small><code>{enrollment.secret}</code></div>
      </div>}
      <label>Código de 6 números<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus={mode === "challenge"} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="button button-dark button-full" disabled={loading || code.length !== 6}>{loading ? "Validando…" : mode === "enroll" ? "Ativar e entrar" : "Confirmar e entrar"}</button>
      <small>O código muda a cada 30 segundos. Nunca compartilhe o QR Code ou a chave manual.</small>
    </form>
  );
}
