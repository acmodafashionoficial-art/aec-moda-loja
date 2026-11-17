import "server-only";

import type { StoreOrder } from "@/lib/order-types";

const DEFAULT_NTFY_URL = "https://ntfy.sh";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function siteUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  return /^https:\/\//i.test(raw) ? raw : "";
}

function ntfyTopic() {
  return String(process.env.NTFY_TOPIC || "").trim();
}

function ntfyBaseUrl() {
  const raw = String(process.env.NTFY_BASE_URL || DEFAULT_NTFY_URL)
    .trim()
    .replace(/\/$/, "");

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return DEFAULT_NTFY_URL;
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_NTFY_URL;
  }
}

async function sendNtfy(input: {
  title: string;
  message: string;
  tags: string;
  orderId?: string;
}) {
  const topic = ntfyTopic();
  if (!topic) return;

  const headers: Record<string, string> = {
    Title: input.title,
    Priority: "high",
    Tags: input.tags,
    "Content-Type": "text/plain; charset=utf-8",
  };

  const publicUrl = siteUrl();
  if (publicUrl && input.orderId) {
    headers.Click = `${publicUrl}/admin/pedidos/${encodeURIComponent(input.orderId)}`;
  }

  try {
    const response = await fetch(
      `${ntfyBaseUrl()}/${encodeURIComponent(topic)}`,
      {
        method: "POST",
        headers,
        body: input.message,
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!response.ok) {
      console.error("ntfy recusou a notificação:", response.status);
    }
  } catch (error) {
    console.error(
      "Não foi possível enviar a notificação ntfy:",
      error instanceof Error ? error.message : "erro desconhecido",
    );
  }
}

export async function notifyNewOrder(order: StoreOrder) {
  await sendNtfy({
    title: "A&C Moda - Novo pedido",
    message: [
      `Pedido: ${order.publicCode}`,
      `Cliente: ${order.customerName}`,
      `Total: ${money(order.total)}`,
      `Status: aguardando pagamento`,
    ].join("\n"),
    tags: "shopping_bags",
    orderId: order.id,
  });
}

export async function notifyPaymentApproved(order: StoreOrder) {
  await sendNtfy({
    title: "A&C Moda - Pagamento confirmado",
    message: [
      `Pedido: ${order.publicCode}`,
      `Total: ${money(order.total)}`,
      `Pagamento aprovado.`,
    ].join("\n"),
    tags: "white_check_mark,moneybag",
    orderId: order.id,
  });
}
