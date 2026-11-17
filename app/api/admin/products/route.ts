import { NextResponse } from "next/server";
import { listProducts, saveProduct } from "@/lib/product-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminApi, requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function GET() {
  try { await requireAdminApi(); return NextResponse.json({ products: await listProducts({ includeInactive: true }) }, { headers: noStoreHeaders() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar produtos." }, { status: securityStatus(error, 500), headers: noStoreHeaders() }); }
}

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    const product = await saveProduct(await readJson(request, 512 * 1024));
    await writeAudit({ request, action: "product.create", resourceType: "product", resourceId: product.id, metadata: { name: product.name } });
    return NextResponse.json({ product }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar produto." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
