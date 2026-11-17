import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getProductById } from "@/lib/catalog";
import { lookupPostalCode, normalizeLocationName } from "@/lib/cep";
import { getShippingQuotes } from "@/lib/shipping";
import { getStoreSettings } from "@/lib/store-settings";
import { createInfinitePayCheckout } from "@/lib/infinitepay";
import { createPendingOrder, generatePublicOrderCode, markCheckoutError, releaseExpiredReservations, savePaymentMetadata } from "@/lib/order-repository";
import type { OrderItemSnapshot } from "@/lib/order-types";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";
import { isUuid, isValidCnpj, isValidCpf } from "@/lib/security/validation";

export const runtime = "nodejs";

type CheckoutItem = { productId: string; quantity: number; size: string; color: string };
type CheckoutBody = { customer?: Record<string, unknown>; items?: CheckoutItem[]; fulfillment?: "delivery" | "pickup" | "local_delivery"; shippingServiceId?: string };

function cleanText(value: unknown, max = 180) { return typeof value === "string" ? value.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max) : ""; }
function digits(value: unknown, max = 20) { return String(value ?? "").replace(/\D/g, "").slice(0, max); }

function validateCustomer(customer: Record<string, unknown>) {
  const name = cleanText(customer.name, 120);
  const email = cleanText(customer.email, 180).toLowerCase();
  const phone = digits(customer.phone, 15);
  const document = digits(customer.document, 14);
  if (name.length < 3 || name.split(/\s+/).length < 2) throw new Error("Informe o nome completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if (phone.length < 10 || phone.length > 11) throw new Error("Informe um telefone com DDD.");
  if (!isValidCpf(document) && !isValidCnpj(document)) throw new Error("Informe um CPF ou CNPJ válido.");
  return { name, email, phone, document };
}

function aggregateItems(rawItems: CheckoutItem[]) {
  const grouped = new Map<string, CheckoutItem>();
  for (const item of rawItems.slice(0, 30)) {
    const productId = cleanText(item.productId, 60);
    if (!isUuid(productId)) throw new Error("Produto inválido na sacola.");
    const size = cleanText(item.size, 50);
    const color = cleanText(item.color, 50);
    const quantity = Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 10);
    const key = `${productId}|${size}|${color}`;
    const current = grouped.get(key);
    grouped.set(key, { productId, size, color, quantity: (current?.quantity || 0) + quantity });
  }
  const result = [...grouped.values()];
  if (!result.length) throw new Error("A sacola está vazia.");
  if (result.some((item) => item.quantity > 10) || result.reduce((sum, item) => sum + item.quantity, 0) > 30) throw new Error("Quantidade máxima por pedido excedida.");
  return result;
}

export async function POST(request: Request) {
  let createdOrderId = "";
  try {
    assertSameOrigin(request);
    const limit = await checkRateLimit(`checkout:${hashedClientId(request, "checkout")}`, { limit: 8, windowSeconds: 10 * 60, blockSeconds: 30 * 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas de compra. Aguarde antes de tentar novamente." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    await releaseExpiredReservations();
    const body = await readJson<CheckoutBody>(request, 128 * 1024);
    const rawItems = aggregateItems(Array.isArray(body.items) ? body.items : []);

    const validated = await Promise.all(rawItems.map(async (item) => {
      const product = await getProductById(item.productId);
      if (!product || !product.active) throw new Error("Um produto da sacola não está mais disponível.");
      const variant = product.variants.find((option) => option.size === item.size && option.color === item.color);
      if (!variant) throw new Error(`A variação escolhida de ${product.name} não está mais disponível.`);
      if (item.quantity > variant.stock) throw new Error(`Estoque insuficiente para ${product.name} — ${item.size} / ${item.color}.`);
      if (!Number.isFinite(product.price) || product.price <= 0 || product.price > 1_000_000) throw new Error("Preço inválido no catálogo.");
      const snapshot: OrderItemSnapshot = {
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        slug: product.slug,
        name: product.name,
        image: product.imageThumbnail || product.image,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPrice: product.price,
        lineTotal: Math.round(product.price * item.quantity * 100) / 100,
      };
      return snapshot;
    }));

    const rawCustomer = body.customer || {};
    const customer = validateCustomer(rawCustomer);
    const settings = await getStoreSettings();
    const requestedFulfillment = body.fulfillment === "pickup" ? "pickup" : body.fulfillment === "local_delivery" ? "local_delivery" : "delivery";
    const fulfillment = requestedFulfillment === "pickup" ? "pickup" : "delivery";
    const localDelivery = requestedFulfillment === "local_delivery";
    const subtotal = Math.round(validated.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    if (subtotal <= 0 || subtotal > 1_000_000) throw new Error("Total do pedido inválido.");

    let shippingCost = 0;
    let shippingService: Record<string, unknown>;
    let shippingAddress: Record<string, unknown>;
    let shippingQuoteId = cleanText(body.shippingServiceId, 100);

    if (requestedFulfillment === "pickup") {
      if (!settings.pickupEnabled) throw new Error("A retirada na loja não está disponível.");
      shippingService = {
        id: "store-pickup",
        type: "pickup",
        name: cleanText(settings.pickupName, 120),
        address: cleanText(settings.pickupAddress, 300),
        instructions: cleanText(settings.pickupInstructions, 500),
        price: 0,
      };
      shippingAddress = {
        type: "pickup",
        address: cleanText(settings.pickupAddress, 300),
        instructions: cleanText(settings.pickupInstructions, 500),
      };
      shippingQuoteId = "store-pickup";
    } else if (localDelivery) {
      if (!settings.localDeliveryEnabled) throw new Error("A entrega local está temporariamente indisponível.");
      const postalCode = digits(rawCustomer.postalCode, 8);
      if (postalCode.length !== 8) throw new Error("Informe um CEP válido para entrega local.");
      const officialAddress = await lookupPostalCode(postalCode);
      if (!officialAddress) throw new Error("Não foi possível confirmar o CEP informado.");
      const correctCity = normalizeLocationName(officialAddress.city) === normalizeLocationName(settings.localDeliveryCity);
      const correctState = officialAddress.state.toUpperCase() === settings.localDeliveryState.toUpperCase();
      if (!correctCity || !correctState) throw new Error(`A entrega local grátis está disponível somente em ${settings.localDeliveryCity}-${settings.localDeliveryState}. Escolha uma transportadora para outro endereço.`);

      const street = cleanText(rawCustomer.street || officialAddress.street, 180);
      const number = cleanText(rawCustomer.number, 40);
      const complement = cleanText(rawCustomer.complement, 120);
      const neighborhood = cleanText(rawCustomer.neighborhood || officialAddress.neighborhood, 120);
      const reference = cleanText(rawCustomer.reference, 180);
      if (!street || !number || !neighborhood) throw new Error("Preencha o endereço completo para a entrega local.");
      if (reference.length < 3) throw new Error("Informe um ponto de referência para facilitar a entrega.");

      shippingService = {
        id: "local-delivery-jatauba",
        type: "local_delivery",
        name: cleanText(settings.localDeliveryName, 120),
        company: cleanText(settings.storeName, 80),
        deliveryLabel: cleanText(settings.localDeliveryInstructions, 500),
        supportHours: cleanText(settings.supportHours, 180),
        city: cleanText(settings.localDeliveryCity, 100),
        state: cleanText(settings.localDeliveryState, 2),
        price: 0,
      };
      shippingAddress = {
        type: "local_delivery",
        postalCode,
        state: officialAddress.state,
        city: officialAddress.city,
        street,
        number,
        complement,
        neighborhood,
        reference,
      };
      shippingQuoteId = "local-delivery-jatauba";
    } else {
      const postalCode = digits(rawCustomer.postalCode, 8);
      if (postalCode.length !== 8) throw new Error("Informe um CEP válido para entrega.");
      const address = {
        state: cleanText(rawCustomer.state, 2).toUpperCase(),
        city: cleanText(rawCustomer.city, 100),
        street: cleanText(rawCustomer.street, 180),
        number: cleanText(rawCustomer.number, 40),
        complement: cleanText(rawCustomer.complement, 120),
        neighborhood: cleanText(rawCustomer.neighborhood, 120),
      };
      if (!/^[A-Z]{2}$/.test(address.state) || !address.city || !address.street || !address.number || !address.neighborhood) throw new Error("Preencha o endereço completo.");
      const quotes = await getShippingQuotes(postalCode, validated.map((item) => ({ productId: item.productId, quantity: item.quantity })));
      const selected = quotes.find((quote) => quote.id === shippingQuoteId);
      if (!selected || !Number.isFinite(selected.price) || selected.price < 0) throw new Error("A opção de frete expirou. Calcule novamente.");
      shippingCost = settings.freeShippingFrom > 0 && subtotal >= settings.freeShippingFrom ? 0 : selected.price;
      shippingService = { ...selected, quotedPrice: selected.price, price: shippingCost, postalCode, type: "carrier" };
      shippingAddress = { type: "delivery", postalCode, ...address };
    }

    const orderId = randomUUID();
    createdOrderId = orderId;
    const publicCode = generatePublicOrderCode();
    const total = Math.round((subtotal + shippingCost) * 100) / 100;

    const order = await createPendingOrder({
      id: orderId,
      publicCode,
      subtotal,
      shippingCost,
      total,
      fulfillmentType: fulfillment,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerDocument: customer.document,
      shippingAddress,
      shippingService,
      shippingQuoteId,
      items: validated,
      reservationMinutes: Math.min(180, Math.max(15, Number(process.env.ORDER_RESERVATION_MINUTES) || 120)),
    });

    try {
      const checkout = await createInfinitePayCheckout({ order });
      await savePaymentMetadata(orderId, { provider: "infinitepay" });
      return NextResponse.json({ checkoutUrl: checkout.checkoutUrl, orderId, publicCode, provider: "infinitepay", webhookEnabled: checkout.webhookEnabled }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : "Não foi possível abrir o pagamento.";
      await markCheckoutError(orderId, message);
      throw paymentError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no checkout.";
    if (createdOrderId) console.error(`Checkout ${createdOrderId}:`, message);
    return NextResponse.json({ error: message }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}