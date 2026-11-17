"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function AdminRecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível solicitar a recuperação.");
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="admin-login-card" onSubmit={submit}>
    <div className="admin-login-brand"><strong>A&C</strong><span>RECUPERAÇÃO</span></div>
    <span className="eyebrow">CONTA ADMINISTRATIVA</span>
    <h1>Recuperar senha</h1>
    <p>Informe o e-mail autorizado. O link terá validade limitada e encerrará as sessões antigas depois da troca.</p>
    <label>E-mail<input type="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    {message && <div className="form-success">{message}</div>}
    {error && <div className="form-error">{error}</div>}
    <button className="button button-dark button-full" disabled={loading}>{loading ? "Enviando…" : "Enviar instruções"}</button>
    <Link className="admin-login-link" href="/admin/login">Voltar ao login</Link>
  </form>;
}
