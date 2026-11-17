import { NextResponse } from "next/server";
import { getShippingQuotes } from "@/lib/shipping";
import { getStoreSettings } from "@/lib/store-settings";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";
import { isUuid } from "@/lib/security/validation";

type Body = { postalCode?: string; items?: Array<{ productId: string; quantity: number }> };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await checkRateLimit(`shipping-quote:${hashedClientId(request, "shipping")}`, { limit: 20, windowSeconds: 60, blockSeconds: 5 * 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Muitas cotações. Aguarde um momento." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const body = await readJson<Body>(request, 48 * 1024);
    const postalCode = String(body.postalCode || "").replace(/\D/g, "").slice(0, 8);
    if (postalCode.length !== 8) throw new Error("Informe um CEP válido.");
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
    if (!rawItems.length) throw new Error("A sacola está vazia.");
    const items = rawItems.map((item) => {
      if (!isUuid(item.productId)) throw new Error("Produto inválido na sacola.");
      return { productId: item.productId, quantity: Math.min(10, Math.max(1, Math.floor(Number(item.quantity) || 1))) };
    });
    if (items.reduce((sum, item) => sum + item.quantity, 0) > 30) throw new Error("Quantidade máxima por pedido excedida.");
    const [quotes, settings] = await Promise.all([getShippingQuotes(postalCode, items), getStoreSettings()]);
    return NextResponse.json({ quotes, pickup: settings.pickupEnabled ? { id: "store-pickup", name: settings.pickupName, address: settings.pickupAddress, instructions: settings.pickupInstructions, price: 0 } : null }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível calcular o frete." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
