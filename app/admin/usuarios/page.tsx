import { AdminShell } from "@/components/admin-shell";
import { AdminUsersManager } from "@/components/admin-users-manager";
import { requireOwnerPage } from "@/lib/admin-auth";
import { listAdminUsers } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireOwnerPage();
  const users = await listAdminUsers();
  return <AdminShell active="users">
    <div className="admin-heading compact"><div><span className="eyebrow">ACESSOS</span><h1>Contas administrativas</h1><p>Cada pessoa usa seu próprio e-mail, senha e autenticador.</p></div></div>
    <AdminUsersManager users={users} currentId={session.id} bootstrap={session.legacy} />
  </AdminShell>;
}
