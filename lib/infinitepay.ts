import "server-only";

import { getOrderById, confirmPaidOrder, savePaymentMetadata } from "@/lib/order-repository";
import type { StoreOrder } from "@/lib/order-types";
import { getPaymentSettings, normalizeInfinitePayHandle } from "@/lib/payment-settings";
import { isUuid, safeHttpsUrl } from "@/lib/security/validation";

const LINKS_URL = "https://api.checkout.infinitepay.io/links";
const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";

function cents(value: number) { return Math.round((Number(value) || 0) * 100); }
function safeText(value: unknown, max = 180) { return String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max); }
function brazilPhone(value: unknown) { let number = String(value || "").replace(/\D/g, ""); if (number.startsWith("55") && number.length >= 12) number = number.slice(2); return number.length >= 10 ? `+55${number.slice(0, 11)}` : undefined; }
function publicSiteUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("A URL pública da loja precisa usar HTTPS.");
  return url.toString().replace(/\/$/, "");
}
function publicWebhookUrl(siteUrl: string) {
  const explicit = safeHttpsUrl(process.env.INFINITEPAY_WEBHOOK_URL, 1000);
  if (explicit) return explicit;
  return /^https:\/\//i.test(siteUrl) ? `${siteUrl}/api/webhooks/infinitepay` : undefined;
}

export type InfinitePayCheckoutInput = { order: StoreOrder };

export async function createInfinitePayCheckout({ order }: InfinitePayCheckoutInput) {
  if (!isUuid(order.id)) throw new Error("Identificador do pedido inválido.");
  const settings = await getPaymentSettings();
  const handle = normalizeInfinitePayHandle(settings.infinitePayHandle || process.env.INFINITEPAY_HANDLE);
  if (!settings.checkoutEnabled) throw new Error("O checkout da InfinitePay ainda não foi ativado no painel.");
  if (!handle) throw new Error("Informe a InfiniteTag da loja no painel de pagamentos.");

  const siteUrl = publicSiteUrl();
  const redirectUrl = new URL(`${siteUrl}/pedido/sucesso`);
  redirectUrl.searchParams.set("provider", "infinitepay");
  redirectUrl.searchParams.set("code", order.publicCode);

  const items = order.items.slice(0, 30).map((item) => ({ quantity: Math.min(10, Math.max(1, item.quantity)), price: cents(item.unitPrice), description: safeText(`${item.name} — ${item.size} / ${item.color}`, 180) }));
  if (order.shippingCost > 0) {
    const shipping = order.shippingService || {};
    items.push({ quantity: 1, price: cents(order.shippingCost), description: safeText(`Frete — ${shipping.company || shipping.name || "Entrega"}`, 180) });
  }
  if (items.some((item) => item.price <= 0) || items.reduce((sum, item) => sum + item.price * item.quantity, 0) !== cents(order.total)) throw new Error("O total do checkout não corresponde ao pedido.");

  const address = order.shippingAddress || {};
  const payload: Record<string, unknown> = {
    handle,
    redirect_url: redirectUrl.toString(),
    order_nsu: order.id,
    customer: { name: safeText(order.customerName, 120), email: safeText(order.customerEmail, 180).toLowerCase(), phone_number: brazilPhone(order.customerPhone) },
    items,
  };
  const webhookUrl = publicWebhookUrl(siteUrl);
  if (webhookUrl) payload.webhook_url = webhookUrl;
  if (order.fulfillmentType === "delivery") payload.address = { cep: String(address.postalCode || "").replace(/\D/g, "").slice(0, 8), number: safeText(address.number, 40), complement: safeText(address.complement, 120) };

  let response: Response;
  try {
    response = await fetch(LINKS_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch { throw new Error("Não foi possível conectar ao checkout da InfinitePay. Tente novamente em instantes."); }
  const data = await response.json().catch(() => ({}));
  const checkoutUrl = safeHttpsUrl((data as { url?: unknown }).url, 1000);
  if (!response.ok || !checkoutUrl || !new URL(checkoutUrl).hostname.endsWith("infinitepay.io")) {
    console.error("InfinitePay checkout recusado:", response.status);
    throw new Error("Não foi possível abrir o pagamento na InfinitePay.");
  }
  return { checkoutUrl, handle, webhookEnabled: Boolean(webhookUrl) };
}

export type InfinitePayPaymentReference = { orderNsu: string; transactionNsu: string; slug: string; receiptUrl?: string; captureMethod?: string };
type PaymentCheckResponse = { success?: boolean; paid?: boolean; amount?: number; paid_amount?: number; installments?: number; capture_method?: string };

export async function checkInfinitePayPayment(reference: InfinitePayPaymentReference) {
  if (!isUuid(reference.orderNsu)) throw new Error("Pedido inválido.");
  if (!/^[a-zA-Z0-9._-]{3,180}$/.test(reference.transactionNsu) || !/^[a-zA-Z0-9._-]{3,180}$/.test(reference.slug)) throw new Error("Referência de pagamento inválida.");
  const settings = await getPaymentSettings();
  const handle = normalizeInfinitePayHandle(settings.infinitePayHandle || process.env.INFINITEPAY_HANDLE);
  if (!handle) throw new Error("InfiniteTag não configurada.");
  let response: Response;
  try {
    response = await fetch(PAYMENT_CHECK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ handle, order_nsu: reference.orderNsu, transaction_nsu: reference.transactionNsu, slug: reference.slug }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch { throw new Error("Não foi possível consultar a confirmação na InfinitePay."); }
  const data = await response.json().catch(() => ({})) as PaymentCheckResponse;
  if (!response.ok || data.success !== true) throw new Error("A InfinitePay não confirmou a transação.");
  return data;
}

export async function verifyAndConfirmInfinitePayPayment(reference: InfinitePayPaymentReference) {
  const order = await getOrderById(reference.orderNsu);
  if (!order) throw new Error("Pedido não encontrado.");
  const verification = await checkInfinitePayPayment(reference);
  if (!verification.paid) throw new Error("Pagamento ainda não confirmado.");
  const expectedAmount = cents(order.total);
  const confirmedAmount = Number(verification.paid_amount ?? verification.amount);
  if (!Number.isInteger(confirmedAmount) || confirmedAmount !== expectedAmount) throw new Error("O valor confirmado é diferente do total do pedido.");
  const method = safeText(verification.capture_method || reference.captureMethod || "", 40);
  const transactionNsu = safeText(reference.transactionNsu, 160);
  await confirmPaidOrder(order.id, transactionNsu, `InfinitePay • ${method || "pagamento aprovado"}`);
  await savePaymentMetadata(order.id, {
    provider: "infinitepay",
    receiptUrl: safeHttpsUrl(reference.receiptUrl, 1000),
    paymentMethod: method,
    installments: Math.min(12, Math.max(1, Math.floor(Number(verification.installments) || 1))),
    paidAmount: confirmedAmount / 100,
    preferenceId: safeText(reference.slug, 180),
  });
  return { order: await getOrderById(order.id), verification };
}
