import { NextResponse } from "next/server";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { confirmPaidOrder, recordPaymentStatus } from "@/lib/order-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const dataIdFromQuery = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  const xSignature = request.headers.get("x-signature") || "";
  const xRequestId = request.headers.get("x-request-id") || "";
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  try {
    const body = await request.json().catch(() => ({}));
    const dataId = dataIdFromQuery || String(body?.data?.id || "");
    if (secret) WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret });
    if (body?.type !== "payment" || !dataId) return NextResponse.json({ received: true });

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) return NextResponse.json({ received: true, warning: "Token não configurado" });

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!paymentResponse.ok) return NextResponse.json({ received: true }, { status: 200 });

    const payment = await paymentResponse.json();
    const orderId = String(payment.external_reference || payment.metadata?.order_id || "");
    if (orderId) {
      if (payment.status === "approved") {
        await confirmPaidOrder(orderId, String(payment.id), String(payment.status_detail || "approved"));
      } else {
        await recordPaymentStatus(orderId, String(payment.status || "pending"), String(payment.id), String(payment.status_detail || ""));
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
