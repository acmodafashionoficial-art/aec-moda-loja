import { NextResponse } from "next/server";
import { listOrders } from "@/lib/order-repository";
import { isOrderStatus } from "@/lib/order-types";
import { requireAdminApi } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status");
    const orders = await listOrders({
      status: isOrderStatus(rawStatus) ? rawStatus : undefined,
      search: (url.searchParams.get("q") || "").trim().slice(0, 180) || undefined,
      limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100)),
    });
    return NextResponse.json({ orders }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar pedidos." }, { status: securityStatus(error, 500), headers: noStoreHeaders() });
  }
}
