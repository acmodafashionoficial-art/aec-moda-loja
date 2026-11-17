import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getStoreSettings } from "@/lib/store-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const settings = await getStoreSettings();
  return (
    <AdminShell active="settings">
      <div className="admin-heading compact"><div><span className="eyebrow">PERSONALIZAÇÃO</span><h1>Aparência e entrega</h1><p>Logo, cores, textos, contato, frete e retirada em um só lugar.</p></div></div>
      <AdminSettingsForm initialSettings={settings} />
    </AdminShell>
  );
}
