export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
  "payment_failed",
  "checkout_error",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FulfillmentType = "delivery" | "pickup";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pagamento aprovado",
  preparing: "Separando pedido",
  ready_for_pickup: "Pronto para retirada",
  ready_to_ship: "Pronto para envio",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  expired: "Reserva expirada",
  payment_failed: "Pagamento não aprovado",
  checkout_error: "Erro ao abrir pagamento",
};

export type OrderItemSnapshot = {
  productId: string;
  variantId?: string;
  sku?: string;
  slug?: string;
  name: string;
  image?: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type OrderEvent = {
  id: string;
  orderId: string;
  eventType: string;
  label: string;
  note?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type StoreOrder = {
  id: string;
  publicCode: string;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerDocument?: string;
  shippingAddress: Record<string, unknown>;
  shippingService?: Record<string, unknown>;
  shippingQuoteId?: string;
  items: OrderItemSnapshot[];
  paymentProvider?: string;
  paymentPreferenceId?: string;
  paymentId?: string;
  paymentStatusDetail?: string;
  paymentReceiptUrl?: string;
  paymentMethod?: string;
  paymentInstallments?: number;
  paidAmount?: number;
  paidAt?: string;
  reservationExpiresAt?: string;
  shippingStatus?: string;
  shippingTracking?: string;
  shippingTrackingUrl?: string;
  shippingLabelIds: string[];
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  events?: OrderEvent[];
};

export type PendingOrderInput = Omit<StoreOrder,
  "status" | "paymentProvider" | "paymentPreferenceId" | "paymentId" | "paymentStatusDetail" |
  "paymentReceiptUrl" | "paymentMethod" | "paymentInstallments" | "paidAmount" |
  "paidAt" | "shippingStatus" | "shippingTracking" | "shippingTrackingUrl" |
  "shippingLabelIds" | "adminNotes" | "createdAt" | "updatedAt" | "events"
> & {
  reservationMinutes: number;
};

export function isLocalDeliveryService(service: Record<string, unknown> | undefined) {
  return String(service?.type || "") === "local_delivery";
}

export function getOrderStatusLabel(status: OrderStatus, fulfillmentType?: FulfillmentType, localDelivery = false) {
  if (fulfillmentType === "pickup" && status === "delivered") return "Retirado";
  if (localDelivery) {
    if (status === "paid") return "Aguardando confirmação";
    if (status === "preparing") return "Em preparação";
    if (status === "ready_to_ship") return "Pronto para entrega";
    if (status === "shipped") return "Saiu para entrega";
    if (status === "delivered") return "Entregue";
  }
  return ORDER_STATUS_LABELS[status];
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}
