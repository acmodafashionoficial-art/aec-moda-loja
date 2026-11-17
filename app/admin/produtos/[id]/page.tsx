import { notFound } from "next/navigation";
import { AdminProductForm } from "@/components/admin-product-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getLogisticsSettings } from "@/lib/logistics-settings";
import { getProductById } from "@/lib/catalog";

type Props = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const [product, logisticsSettings] = await Promise.all([getProductById(id, true), getLogisticsSettings()]);
  if (!product) notFound();
  return <AdminShell active="products"><div className="admin-heading compact"><div><span className="eyebrow">PRODUTOS</span><h1>Editar produto</h1><p>Altere apenas o necessário e salve.</p></div></div><AdminProductForm product={product} logisticsSettings={logisticsSettings} /></AdminShell>;
}
