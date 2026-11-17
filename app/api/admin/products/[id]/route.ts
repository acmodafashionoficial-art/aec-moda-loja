import { NextResponse } from "next/server";
import { deleteProduct, saveProduct } from "@/lib/product-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Props) {
  try {
    await requireAdminMutation(request);
    const { id } = await params;
    const product = await saveProduct(await readJson(request, 512 * 1024), id);
    await writeAudit({ request, action: "product.update", resourceType: "product", resourceId: id, metadata: { name: product.name } });
    return NextResponse.json({ product }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar produto." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}

export async function DELETE(request: Request, { params }: Props) {
  try {
    await requireAdminMutation(request);
    const { id } = await params;
    await deleteProduct(id);
    await writeAudit({ request, action: "product.delete", resourceType: "product", resourceId: id });
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir produto." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
