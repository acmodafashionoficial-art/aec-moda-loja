import Link from "next/link";
import { AdminAccountActions } from "@/components/admin-account-actions";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function MyAccountPage() {
  const session = await requireAdminPage();
  return <AdminShell active="account">
    <div className="admin-heading compact"><div><span className="eyebrow">PERFIL</span><h1>Minha conta</h1><p>Dados do acesso usado nesta sessão.</p></div></div>
    <div className="admin-account-grid">
      <section className="admin-form-card"><h2>{session.displayName}</h2><p><strong>E-mail</strong><br />{session.email || "Configuração inicial"}</p><p><strong>Permissão</strong><br />{session.role === "owner" ? "Proprietária" : "Administradora"}</p><p><strong>Autenticação</strong><br />{session.legacy ? "Acesso temporário — crie a primeira conta individual" : "Senha individual + código autenticador"}</p></section>
      <section className="admin-form-card"><h2>Proteção da conta</h2><p>Para trocar a senha, saia do painel e use a recuperação por e-mail. Isso evita que uma pessoa com uma sessão aberta altere a senha silenciosamente.</p><Link className="button button-outline" href="/admin/recuperar-senha">Solicitar troca de senha</Link>{!session.legacy && <AdminAccountActions />}</section>
    </div>
  </AdminShell>;
}
