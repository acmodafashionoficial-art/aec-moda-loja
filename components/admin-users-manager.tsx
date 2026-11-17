"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/admin-users";

function statusLabel(status: AdminUser["status"]) {
  return status === "active" ? "Ativa" : status === "invited" ? "Convite enviado" : "Desativada";
}

export function AdminUsersManager({ users, currentId, bootstrap }: { users: AdminUser[]; currentId: string; bootstrap: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin">(bootstrap ? "owner" : "admin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState("");

  async function invite(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o convite.");
      setMessage(result.message);
      setDisplayName("");
      setEmail("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o convite.");
    } finally {
      setLoading(false);
    }
  }

  async function act(user: AdminUser, action: string, nextRole?: "owner" | "admin") {
    const dangerous = action === "disable" || action === "reset_mfa";
    if (dangerous && !window.confirm(action === "disable" ? `Desativar a conta de ${user.displayName}?` : `Remover o autenticador de ${user.displayName}? Ela precisará configurar outro no próximo acesso.`)) return;
    setActionId(`${user.id}:${action}`);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role: nextRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a conta.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a conta.");
    } finally {
      setActionId("");
    }
  }

  return <div className="admin-users-layout">
    <form className="admin-form-card admin-user-invite" onSubmit={invite}>
      <h2>{bootstrap ? "Convide a primeira proprietária" : "Adicionar administradora"}</h2>
      <p>{bootstrap ? "Use o e-mail que a proprietária acessa no celular. A senha compartilhada deixará de funcionar assim que o convite for aceito." : "A pessoa receberá um link para criar a própria senha e configurar o código de segurança."}</p>
      <label>Nome<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
      <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {!bootstrap && <label>Permissão<select value={role} onChange={(event) => setRole(event.target.value as "owner" | "admin")}><option value="admin">Administradora</option><option value="owner">Proprietária</option></select></label>}
      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <button className="button button-dark button-full" disabled={loading}>{loading ? "Enviando…" : "Enviar convite seguro"}</button>
      <small>O link de convite expira. Configure no Supabase as URLs de redirecionamento antes de enviar.</small>
    </form>

    <div className="admin-panel admin-users-panel">
      <div className="admin-panel-title"><div><h2>Contas autorizadas</h2><span>{users.length} conta(s) cadastrada(s)</span></div></div>
      {users.length ? <div className="admin-user-list">{users.map((user) => <article key={user.id}>
        <div className="admin-user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="admin-user-identity"><strong>{user.displayName}{user.id === currentId ? " • você" : ""}</strong><span>{user.email}</span><small>Último acesso: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "ainda não entrou"}</small></div>
        <div className="admin-user-badges"><span className={`status-pill ${user.status === "active" ? "active" : "draft"}`}>{statusLabel(user.status)}</span><span className="status-pill draft">{user.role === "owner" ? "Proprietária" : "Administradora"}</span><span className="status-pill active">2FA obrigatório</span></div>
        {!bootstrap && <div className="admin-user-actions">
          {user.id !== currentId && (user.status === "active" ? <button disabled={Boolean(actionId)} onClick={() => act(user, "disable")}>Desativar</button> : <button disabled={Boolean(actionId)} onClick={() => act(user, "enable")}>Ativar</button>)}
          {user.status === "active" && user.id !== currentId && <button disabled={Boolean(actionId)} onClick={() => act(user, "revoke_sessions")}>Encerrar sessões</button>}
          {user.status === "active" && user.id !== currentId && <button disabled={Boolean(actionId)} onClick={() => act(user, "reset_mfa")}>Redefinir 2FA</button>}
          {user.id !== currentId && user.status === "active" && <button disabled={Boolean(actionId)} onClick={() => act(user, "role", user.role === "owner" ? "admin" : "owner")}>{user.role === "owner" ? "Tornar administradora" : "Tornar proprietária"}</button>}
        </div>}
      </article>)}</div> : <div className="admin-empty"><h3>Nenhuma conta individual</h3><p>Envie o primeiro convite ao lado.</p></div>}
    </div>
  </div>;
}
