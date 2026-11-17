import { NextResponse } from "next/server";
import { verifyAndConfirmInfinitePayPayment } from "@/lib/infinitepay";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { enforceContentLength, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";
import { isUuid, safeHttpsUrl } from "@/lib/security/validation";

export const runtime = "nodejs";

function text(value: unknown, max = 1000) { return String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max); }

export async function POST(request: Request) {
  try {
    enforceContentLength(request, 64 * 1024);
    const limit = await checkRateLimit(`webhook-infinitepay:${hashedClientId(request, "webhook-infinitepay")}`, { limit: 120, windowSeconds: 60, blockSeconds: 5 * 60 });
    if (!limit.allowed) return NextResponse.json({ success: false, message: "Limite excedido" }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const body = await readJson<Record<string, unknown>>(request, 64 * 1024);
    const orderNsu = text(body?.order_nsu, 100);
    const transactionNsu = text(body?.transaction_nsu, 180);
    const slug = text(body?.invoice_slug || body?.slug, 180);
    if (!isUuid(orderNsu) || !/^[a-zA-Z0-9._-]{3,180}$/.test(transactionNsu) || !/^[a-zA-Z0-9._-]{3,180}$/.test(slug)) {
      return NextResponse.json({ success: false, message: "Dados do pagamento incompletos" }, { status: 400, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    }
    await verifyAndConfirmInfinitePayPayment({
      orderNsu,
      transactionNsu,
      slug,
      receiptUrl: safeHttpsUrl(body?.receipt_url, 1000),
      captureMethod: text(body?.capture_method, 40),
    });
    return NextResponse.json({ success: true, message: null }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível confirmar o pagamento";
    console.error("Webhook InfinitePay:", message);
    return NextResponse.json({ success: false, message: "Não foi possível confirmar o pagamento." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
