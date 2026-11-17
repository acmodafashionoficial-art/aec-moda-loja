import { NextResponse } from "next/server";
import { getOrderById, updateOrderStatus } from "@/lib/order-repository";
import { isOrderStatus } from "@/lib/order-types";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminApi, requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";
import { isUuid, safeHttpsUrl } from "@/lib/security/validation";

type Props = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Props) {
  try {
    await requireAdminApi();
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers: noStoreHeaders() });
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404, headers: noStoreHeaders() });
    return NextResponse.json({ order }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar pedido." }, { status: securityStatus(error, 500), headers: noStoreHeaders() });
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    await requireAdminMutation(request);
    const { id } = await params;
    if (!isUuid(id)) throw new Error("Pedido inválido.");
    const body = await readJson<Record<string, unknown>>(request, 32 * 1024);
    if (!isOrderStatus(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400, headers: noStoreHeaders() });
    const rawTrackingUrl = String(body.trackingUrl || "").trim();
    const trackingUrl = rawTrackingUrl ? safeHttpsUrl(rawTrackingUrl, 500) : "";
    if (rawTrackingUrl && !trackingUrl) throw new Error("O link de rastreamento precisa usar HTTPS.");
    const order = await updateOrderStatus(id, body.status, String(body.note || "").trim().slice(0, 1000), {
      tracking: String(body.tracking || "").replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 120),
      trackingUrl,
    });
    await writeAudit({ request, action: "order.status_update", resourceType: "order", resourceId: id, metadata: { status: body.status } });
    return NextResponse.json({ order }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
