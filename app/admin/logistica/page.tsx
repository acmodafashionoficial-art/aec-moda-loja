import { AdminLogisticsForm } from "@/components/admin-logistics-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getLogisticsSettings } from "@/lib/logistics-settings";

export const dynamic = "force-dynamic";

export default async function LogisticsPage() {
  await requireAdminPage();
  const settings = await getLogisticsSettings();
  return (
    <AdminShell active="logistics">
      <div className="admin-heading compact">
        <div><span className="eyebrow">LOGÍSTICA AUTOMÁTICA</span><h1>Pesos e embalagens</h1><p>Meça uma vez, salve o padrão e deixe o sistema calcular pedidos com várias unidades.</p></div>
      </div>
      <AdminLogisticsForm initialSettings={settings} />
    </AdminShell>
  );
}
