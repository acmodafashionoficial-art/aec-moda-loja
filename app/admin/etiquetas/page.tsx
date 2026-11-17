import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { InventoryLabels } from "@/components/inventory-labels";
import { requireAdminPage } from "@/lib/admin-auth";
import { listAvailableInventoryUnits } from "@/lib/inventory-repository";

export const dynamic = "force-dynamic";

export default async function InventoryLabelsPage() {
  await requireAdminPage();

  const units = await listAvailableInventoryUnits();
  const siteUrl = String(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.aecmoda.com.br",
  ).replace(/\/$/, "");

  return (
    <AdminShell active="inventory">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">ESTOQUE FÍSICO</span>
          <h1>Etiquetas e vendas</h1>
          <p>
            Imprima uma etiqueta individual para cada peça e registre vendas
            presenciais pelo QR Code.
          </p>
        </div>

        <div className="admin-heading-actions">
          <Link href="/admin/investidores" className="button button-outline">
            Investidores e rodízio
          </Link>
          <Link href="/admin/vendas-presenciais" className="button button-outline">
            Histórico de vendas
          </Link>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <h2>Etiquetas disponíveis</h2>
            <span>{units.length} peça(s) disponível(is) para impressão</span>
          </div>
        </div>

        <InventoryLabels units={units} siteUrl={siteUrl} />
      </div>
    </AdminShell>
  );
}
