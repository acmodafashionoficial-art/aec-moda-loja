import { NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { getShippingQuoteDiagnostics } from "@/lib/shipping";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    const body = await readJson<Record<string, unknown>>(request, 8 * 1024);
    const postalCode = String(body?.postalCode || "").replace(/\D/g, "").slice(0, 8);
    if (postalCode.length !== 8) throw new Error("Informe um CEP de teste válido.");

    const products = await getProducts(true);
    const product = products.find((item) => item.active && item.variants.some((variant) => variant.stock > 0)) || products[0];
    if (!product) throw new Error("Cadastre pelo menos um produto antes de testar o frete.");

    const result = await getShippingQuoteDiagnostics(postalCode, [{ productId: product.id, quantity: 1 }]);
    return NextResponse.json({
      product: product.name,
      quotes: result.quotes,
      rejectedServices: result.rejectedServices,
      packageSummary: result.packageSummary,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Não foi possível testar a cotação.",
    }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
