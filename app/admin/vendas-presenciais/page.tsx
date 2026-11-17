import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { InStoreSalesList } from "@/components/in-store-sales-list";
import { requireAdminPage } from "@/lib/admin-auth";
import { listInStoreSales } from "@/lib/inventory-repository";

export const dynamic = "force-dynamic";

export default async function InStoreSalesPage() {
  await requireAdminPage();
  const sales = await listInStoreSales();

  return (
    <AdminShell active="inventory">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">CONTROLE DE ESTOQUE</span>
          <h1>Vendas presenciais</h1>
          <p>
            Consulte as baixas feitas pelo QR Code e devolva uma peça ao estoque
            quando uma venda for cancelada.
          </p>
        </div>

        <div className="admin-heading-actions">
          <Link href="/admin/etiquetas" className="button button-outline">
            Voltar para etiquetas
          </Link>
        </div>
      </div>

      <InStoreSalesList sales={sales} />
    </AdminShell>
  );
}
