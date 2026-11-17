"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm({ bootstrap }: { bootstrap: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: bootstrap ? "" : email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      router.replace(result.next || "/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-login-card" onSubmit={submit}>
      <div className="admin-login-brand"><strong>A&C</strong><span>MODA</span></div>
      <span className="eyebrow">ÁREA RESTRITA</span>
      <h1>{bootstrap ? "Criar contas seguras" : "Painel da loja"}</h1>
      <p>{bootstrap ? "Use uma última vez a senha protegida da Fase 8. Depois você convidará cada administradora pelo próprio e-mail." : "Entre com sua conta individual. O código do aplicativo autenticador será solicitado em seguida."}</p>
      {!bootstrap && <label>E-mail<input type="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
      <label>{bootstrap ? "Senha de implantação" : "Senha"}<input type="password" autoComplete={bootstrap ? "current-password" : "current-password"} autoFocus={bootstrap} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="button button-dark button-full" disabled={loading}>{loading ? "Verificando…" : bootstrap ? "Continuar configuração" : "Entrar"}</button>
      {!bootstrap && <Link className="admin-login-link" href="/admin/recuperar-senha">Esqueci minha senha</Link>}
      <small>{bootstrap ? "A senha compartilhada será desativada automaticamente quando a primeira proprietária aceitar o convite." : "Cada pessoa usa sua própria senha e um código temporário de 6 números."}</small>
    </form>
  );
}
