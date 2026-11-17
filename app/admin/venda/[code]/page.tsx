import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { InStoreSaleForm } from "@/components/in-store-sale-form";
import { requireAdminPage } from "@/lib/admin-auth";
import { getInventoryUnitByCode } from "@/lib/inventory-repository";

type Props = {
  params: Promise<{ code: string }>;
};

export const dynamic = "force-dynamic";

export default async function InStoreSalePage({ params }: Props) {
  await requireAdminPage();

  const { code } = await params;
  const unit = await getInventoryUnitByCode(
    decodeURIComponent(code),
  );

  return (
    <AdminShell active="inventory">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">VENDA PRESENCIAL</span>
          <h1>Leitura da etiqueta</h1>
          <p>
            Confira os dados da peça antes de confirmar o pagamento e a
            baixa no estoque.
          </p>
        </div>
        <div className="admin-heading-actions">
          <Link
            href="/admin/etiquetas"
            className="button button-outline"
          >
            Voltar
          </Link>
        </div>
      </div>

      {!unit ? (
        <div className="admin-empty">
          <h3>Etiqueta não encontrada</h3>
          <p>
            O código informado não existe ou foi digitado incorretamente.
          </p>
        </div>
      ) : (
        <InStoreSaleForm unit={unit} />
      )}
    </AdminShell>
  );
}
