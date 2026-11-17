import { NextResponse } from "next/server";
import { getOrderForCustomer } from "@/lib/order-repository";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await checkRateLimit(`order-track:${hashedClientId(request, "track")}`, { limit: 8, windowSeconds: 10 * 60, blockSeconds: 30 * 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Muitas consultas. Aguarde antes de tentar novamente." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const body = await readJson<Record<string, unknown>>(request, 8 * 1024);
    const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
    if (!/^AEC-[A-Z0-9-]{8,30}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Informe o código e o e-mail da compra." }, { status: 400, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const order = await getOrderForCustomer(code, email);
    if (!order) return NextResponse.json({ error: "Pedido não encontrado. Confira os dados." }, { status: 404, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const safeOrder = { ...order, customerDocument: undefined, customerPhone: undefined, paymentId: undefined, paymentPreferenceId: undefined, adminNotes: undefined, shippingAddress: order.fulfillmentType === "pickup" ? order.shippingAddress : { city: order.shippingAddress.city, state: order.shippingAddress.state, postalCode: order.shippingAddress.postalCode } };
    return NextResponse.json({ order: safeOrder }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível consultar o pedido." }, { status: securityStatus(error, 500), headers: noStoreHeaders() });
  }
}
