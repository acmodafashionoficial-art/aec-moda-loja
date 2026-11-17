import { AdminShell } from "@/components/admin-shell";
import { InvestmentManager } from "@/components/investment-manager";
import { requireAdminPage } from "@/lib/admin-auth";
import {
  getInvestmentDashboard,
  getUnassignedInvestmentStock,
} from "@/lib/investment-repository";
import { listProducts } from "@/lib/product-repository";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  await requireAdminPage();

  const [dashboard, products, unassignedStock] = await Promise.all([
    getInvestmentDashboard(),
    listProducts({ includeInactive: true }),
    getUnassignedInvestmentStock(),
  ]);

  const productGroups = products
    .filter((product) => product.active)
    .map((product) => {
      const variants = product.variants
        .filter((variant) => Boolean(variant.id))
        .map((variant) => {
          const id = String(variant.id);
          return {
            id,
            size: variant.size,
            color: variant.color,
            sku: variant.sku,
            currentStock: Number(variant.physicalStock ?? variant.stock) || 0,
            unassignedStock: Math.max(0, Number(unassignedStock[id]) || 0),
          };
        })
        .sort(
          (a, b) =>
            a.size.localeCompare(b.size, "pt-BR") ||
            a.color.localeCompare(b.color, "pt-BR"),
        );

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.imageThumbnail || product.image || "/products/body-vinho.svg",
        currentStock: variants.reduce(
          (sum, variant) => sum + variant.currentStock,
          0,
        ),
        unassignedStock: variants.reduce(
          (sum, variant) => sum + variant.unassignedStock,
          0,
        ),
        variants,
      };
    })
    .filter((product) => product.variants.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <AdminShell active="investors">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">INVESTIDORES E RODÍZIO</span>
          <h1>Distribuição automática das vendas</h1>
          <p>
            Cadastre os investidores, crie um lote por grupos de roupas e
            acompanhe ao vivo de quem é a vez.
          </p>
        </div>
      </div>

      <InvestmentManager
        investors={dashboard.investors}
        lots={dashboard.lots}
        participants={dashboard.participants}
        queue={dashboard.queue}
        lotItems={dashboard.lotItems}
        productGroups={productGroups}
      />
    </AdminShell>
  );
}
