import { AdminProductForm } from "@/components/admin-product-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getLogisticsSettings } from "@/lib/logistics-settings";

export default async function NewProductPage() {
  await requireAdminPage();
  const logisticsSettings = await getLogisticsSettings();
  return <AdminShell active="products"><div className="admin-heading compact"><div><span className="eyebrow">PRODUTOS</span><h1>Novo produto</h1><p>Formulário guiado e padronizado.</p></div></div><AdminProductForm logisticsSettings={logisticsSettings} /></AdminShell>;
}
