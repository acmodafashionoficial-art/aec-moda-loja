import { AdminShell } from "@/components/admin-shell";
import { AdminSupabaseSetup } from "@/components/admin-supabase-setup";
import { requireAdminPage } from "@/lib/admin-auth";
import { getSupabaseSetupStatus } from "@/lib/supabase/status";

export const dynamic = "force-dynamic";

export default async function SupabasePage() {
  await requireAdminPage();
  const status = await getSupabaseSetupStatus();
  return <AdminShell active="supabase"><div className="admin-heading"><div><span className="eyebrow">DADOS NA NUVEM</span><h1>Supabase</h1><p>Conecte o banco, valide as tabelas e migre os dados sem perder os cadastros atuais.</p></div></div>{status.error && <div className="form-error">{status.error}</div>}<AdminSupabaseSetup status={status} /></AdminShell>;
}
