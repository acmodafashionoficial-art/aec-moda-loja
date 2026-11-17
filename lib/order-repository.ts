import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewOrder, notifyPaymentApproved } from "@/lib/ntfy-notifications";
import {
  getOrderStatusLabel,
  isLocalDeliveryService,
  type OrderEvent,
  type OrderStatus,
  type PendingOrderInput,
  type StoreOrder,
} from "@/lib/order-types";

const localFile = path.join(process.cwd(), "data", "orders.json");

type OrderRow = {
  id: string;
  public_code?: string | null;
  status: OrderStatus;
  subtotal?: number | string | null;
  shipping_cost?: number | string | null;
  total: number | string;
  fulfillment_type?: "delivery" | "pickup" | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_document?: string | null;
  shipping_address?: unknown;
  shipping_service?: unknown;
  shipping_quote_id?: string | null;
  items?: unknown;
  payment_provider?: string | null;
  payment_preference_id?: string | null;
  payment_id?: string | null;
  payment_status_detail?: string | null;
  payment_receipt_url?: string | null;
  payment_method?: string | null;
  payment_installments?: number | string | null;
  paid_amount?: number | string | null;
  paid_at?: string | null;
  reservation_expires_at?: string | null;
  shipping_status?: string | null;
  shipping_tracking?: string | null;
  shipping_tracking_url?: string | null;
  shipping_label_ids?: unknown;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  order_events?: Array<{
    id: string;
    order_id: string;
    event_type: string;
    label: string;
    note?: string | null;
    metadata?: unknown;
    created_at: string;
  }>;
};

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapEvent(row: NonNullable<OrderRow["order_events"]>[number]): OrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    eventType: row.event_type,
    label: row.label,
    note: row.note || undefined,
    metadata: cleanObject(row.metadata),
    createdAt: row.created_at,
  };
}

function mapOrder(row: OrderRow): StoreOrder {
  return {
    id: row.id,
    publicCode: row.public_code || row.id.slice(0, 8).toUpperCase(),
    status: row.status,
    subtotal: Number(row.subtotal ?? Number(row.total) - Number(row.shipping_cost || 0)),
    shippingCost: Number(row.shipping_cost || 0),
    total: Number(row.total),
    fulfillmentType: row.fulfillment_type === "pickup" ? "pickup" : "delivery",
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone || undefined,
    customerDocument: row.customer_document || undefined,
    shippingAddress: cleanObject(row.shipping_address),
    shippingService: Object.keys(cleanObject(row.shipping_service)).length ? cleanObject(row.shipping_service) : undefined,
    shippingQuoteId: row.shipping_quote_id || undefined,
    items: Array.isArray(row.items) ? row.items as StoreOrder["items"] : [],
    paymentProvider: row.payment_provider || undefined,
    paymentPreferenceId: row.payment_preference_id || undefined,
    paymentId: row.payment_id || undefined,
    paymentStatusDetail: row.payment_status_detail || undefined,
    paymentReceiptUrl: row.payment_receipt_url || undefined,
    paymentMethod: row.payment_method || undefined,
    paymentInstallments: row.payment_installments == null ? undefined : Number(row.payment_installments),
    paidAmount: row.paid_amount == null ? undefined : Number(row.paid_amount),
    paidAt: row.paid_at || undefined,
    reservationExpiresAt: row.reservation_expires_at || undefined,
    shippingStatus: row.shipping_status || undefined,
    shippingTracking: row.shipping_tracking || undefined,
    shippingTrackingUrl: row.shipping_tracking_url || undefined,
    shippingLabelIds: Array.isArray(row.shipping_label_ids)
      ? row.shipping_label_ids.filter((item): item is string => typeof item === "string")
      : [],
    adminNotes: row.admin_notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: (row.order_events || []).map(mapEvent).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

async function readLocalOrders(): Promise<StoreOrder[]> {
  try {
    return JSON.parse(await fs.readFile(localFile, "utf8")) as StoreOrder[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, "[]", "utf8");
    return [];
  }
}

async function writeLocalOrders(orders: StoreOrder[]) {
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, JSON.stringify(orders, null, 2), "utf8");
}

function localEvent(orderId: string, eventType: string, label: string, note?: string): OrderEvent {
  return { id: randomUUID(), orderId, eventType, label, note, createdAt: new Date().toISOString() };
}

export function generatePublicOrderCode() {
  const date = new Date();
  const prefix = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `AEC-${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export async function releaseExpiredReservations() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("release_expired_order_reservations");
  if (error) {
    console.error("Não foi possível liberar reservas expiradas:", error.message);
    return 0;
  }
  return Number(data || 0);
}

export async function createPendingOrder(input: PendingOrderInput) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(15, input.reservationMinutes) * 60_000).toISOString();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const orders = await readLocalOrders();
    const { reservationMinutes: _reservationMinutes, ...orderInput } = input;
    void _reservationMinutes;
    const order: StoreOrder = {
      ...orderInput,
      status: "pending_payment",
      reservationExpiresAt: expiresAt,
      shippingLabelIds: [],
      createdAt: now,
      updatedAt: now,
      events: [localEvent(input.id, "order_created", "Pedido criado e aguardando pagamento")],
    };
    orders.unshift(order);
    await writeLocalOrders(orders);
    await notifyNewOrder(order);
    return order;
  }

  const { error } = await supabase.rpc("create_pending_order", {
    p_order_id: input.id,
    p_public_code: input.publicCode,
    p_subtotal: input.subtotal,
    p_shipping_cost: input.shippingCost,
    p_total: input.total,
    p_fulfillment_type: input.fulfillmentType,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    p_customer_phone: input.customerPhone || null,
    p_customer_document: input.customerDocument || null,
    p_shipping_address: input.shippingAddress,
    p_shipping_service: input.shippingService || {},
    p_shipping_quote_id: input.shippingQuoteId || null,
    p_items: input.items,
    p_reservation_expires_at: expiresAt,
  });
  if (error) throw new Error(`Não foi possível registrar o pedido: ${error.message}`);
  const saved = await getOrderById(input.id);
  if (!saved) throw new Error("O pedido foi criado, mas não pôde ser relido.");
  await notifyNewOrder(saved);
  return saved;
}

export async function listOrders(options: { status?: OrderStatus; search?: string; limit?: number } = {}) {
  await releaseExpiredReservations();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    let orders = await readLocalOrders();
    if (options.status) orders = orders.filter((order) => order.status === options.status);
    const search = options.search?.trim().toLowerCase();
    if (search) orders = orders.filter((order) => [order.publicCode, order.customerName, order.customerEmail, order.customerPhone].some((value) => value?.toLowerCase().includes(search)));
    return orders.slice(0, options.limit || 200);
  }

  let query = supabase
    .from("orders")
    .select("*, order_events(id, order_id, event_type, label, note, metadata, created_at)")
    .order("created_at", { ascending: false })
    .limit(options.limit || 200);
  if (options.status) query = query.eq("status", options.status);
  if (options.search?.trim()) {
    const term = options.search.trim().replace(/[%_,()]/g, "");
    query = query.or(`public_code.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar pedidos: ${error.message}`);
  return ((data || []) as OrderRow[]).map(mapOrder);
}

export async function getOrderById(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return (await readLocalOrders()).find((order) => order.id === id);
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_events(id, order_id, event_type, label, note, metadata, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar pedido: ${error.message}`);
  return data ? mapOrder(data as OrderRow) : undefined;
}

export async function getOrderForCustomer(publicCode: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = publicCode.trim().toUpperCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) return (await readLocalOrders()).find((order) => order.publicCode.toUpperCase() === normalizedCode && order.customerEmail.toLowerCase() === normalizedEmail);
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_events(id, order_id, event_type, label, note, metadata, created_at)")
    .eq("public_code", normalizedCode)
    .ilike("customer_email", normalizedEmail)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o pedido.");
  return data ? mapOrder(data as OrderRow) : undefined;
}

export async function setPaymentPreference(orderId: string, preferenceId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (order) { order.paymentPreferenceId = preferenceId; order.updatedAt = new Date().toISOString(); await writeLocalOrders(orders); }
    return;
  }
  const { error } = await supabase.from("orders").update({ payment_preference_id: preferenceId, updated_at: new Date().toISOString() }).eq("id", orderId);
  if (error) throw new Error(`Erro ao vincular pagamento: ${error.message}`);
}

export async function markCheckoutError(orderId: string, note = "Não foi possível abrir o pagamento") {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    order.status = "checkout_error";
    order.paymentStatusDetail = note;
    order.updatedAt = now;
    order.events = [localEvent(order.id, "checkout_error", "Erro ao abrir pagamento", note), ...(order.events || [])];
    await writeLocalOrders(orders);
    return;
  }
  await supabase.rpc("release_order_reservations", { p_order_id: orderId });
  const { error } = await supabase.from("orders").update({
    status: "checkout_error",
    payment_status_detail: note,
    updated_at: now,
  }).eq("id", orderId);
  if (error) throw new Error(`Erro ao registrar falha do checkout: ${error.message}`);
  await supabase.from("order_events").insert({
    order_id: orderId, event_type: "checkout_error", label: "Erro ao abrir pagamento", note, metadata: {},
  });
}

export async function savePaymentMetadata(orderId: string, metadata: {
  provider: string;
  receiptUrl?: string;
  paymentMethod?: string;
  installments?: number;
  paidAmount?: number;
  preferenceId?: string;
}) {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    order.paymentProvider = metadata.provider;
    if (metadata.receiptUrl) order.paymentReceiptUrl = metadata.receiptUrl;
    if (metadata.paymentMethod) order.paymentMethod = metadata.paymentMethod;
    if (metadata.installments) order.paymentInstallments = metadata.installments;
    if (metadata.paidAmount != null) order.paidAmount = metadata.paidAmount;
    if (metadata.preferenceId) order.paymentPreferenceId = metadata.preferenceId;
    order.updatedAt = now;
    await writeLocalOrders(orders);
    return;
  }
  const { error } = await supabase.from("orders").update({
    payment_provider: metadata.provider,
    payment_receipt_url: metadata.receiptUrl || null,
    payment_method: metadata.paymentMethod || null,
    payment_installments: metadata.installments || null,
    paid_amount: metadata.paidAmount ?? null,
    payment_preference_id: metadata.preferenceId || null,
    updated_at: now,
  }).eq("id", orderId);
  if (error) throw new Error(`Erro ao salvar dados do pagamento: ${error.message}`);
}

export async function confirmPaidOrder(orderId: string, paymentId: string, statusDetail: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === "paid") return false;
    order.status = "paid";
    order.paymentId = paymentId;
    order.paymentStatusDetail = statusDetail;
    order.paidAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    order.events = [localEvent(order.id, "payment_approved", "Pagamento aprovado"), ...(order.events || [])];
    await writeLocalOrders(orders);
    await notifyPaymentApproved(order);
    return true;
  }
  const { data, error } = await supabase.rpc("confirm_paid_order", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_status_detail: statusDetail,
  });
  if (error) throw new Error(`Erro ao confirmar pedido: ${error.message}`);

  const changed = Boolean(data);
  if (changed) {
    const order = await getOrderById(orderId);
    if (order) await notifyPaymentApproved(order);
  }

  return changed;
}

export async function recordPaymentStatus(orderId: string, status: string, paymentId: string, detail: string) {
  const mapped: OrderStatus = status === "rejected" || status === "cancelled" ? "payment_failed" : "pending_payment";
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    order.status = mapped;
    order.paymentId = paymentId;
    order.paymentStatusDetail = detail;
    order.updatedAt = new Date().toISOString();
    order.events = [localEvent(order.id, "payment_update", `Pagamento: ${status}`, detail), ...(order.events || [])];
    await writeLocalOrders(orders);
    return;
  }
  const { error } = await supabase.rpc("record_order_payment_status", {
    p_order_id: orderId,
    p_status: mapped,
    p_payment_id: paymentId,
    p_status_detail: detail,
    p_label: `Pagamento: ${status}`,
  });
  if (error) throw new Error(`Erro ao atualizar pagamento: ${error.message}`);
}


function allowedAdminStatuses(order: StoreOrder): OrderStatus[] {
  const localDelivery = isLocalDeliveryService(order.shippingService);
  if (localDelivery) {
    const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
      pending_payment: ["cancelled"],
      checkout_error: ["cancelled"],
      payment_failed: ["cancelled"],
      expired: ["cancelled"],
      paid: ["preparing", "cancelled"],
      preparing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    return [order.status, ...(transitions[order.status] || [])];
  }

  const readyStatus: OrderStatus = order.fulfillmentType === "pickup" ? "ready_for_pickup" : "ready_to_ship";
  const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    pending_payment: ["cancelled"],
    checkout_error: ["cancelled"],
    payment_failed: ["cancelled"],
    expired: ["cancelled"],
    paid: ["preparing", readyStatus, "cancelled"],
    preparing: [readyStatus, "cancelled"],
    ready_for_pickup: ["delivered", "cancelled"],
    ready_to_ship: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
  };
  return [order.status, ...(transitions[order.status] || [])];
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, note?: string, extras: { tracking?: string; trackingUrl?: string } = {}) {
  const currentOrder = await getOrderById(orderId);
  if (!currentOrder) throw new Error("Pedido não encontrado.");
  const localDelivery = isLocalDeliveryService(currentOrder.shippingService);
  if (!allowedAdminStatuses(currentOrder).includes(status)) {
    throw new Error(`Não é possível alterar de ${getOrderStatusLabel(currentOrder.status, currentOrder.fulfillmentType, localDelivery)} para ${getOrderStatusLabel(status, currentOrder.fulfillmentType, localDelivery)}.`);
  }
  const statusLabel = getOrderStatusLabel(status, currentOrder.fulfillmentType, localDelivery);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const orders = await readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) throw new Error("Pedido não encontrado.");
    order.status = status;
    order.adminNotes = note || order.adminNotes;
    if (extras.tracking) order.shippingTracking = extras.tracking;
    if (extras.trackingUrl) order.shippingTrackingUrl = extras.trackingUrl;
    order.updatedAt = new Date().toISOString();
    order.events = [localEvent(order.id, "status_changed", statusLabel, note), ...(order.events || [])];
    await writeLocalOrders(orders);
    return order;
  }

  if (status === "cancelled") {
    const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_note: note || "Cancelado pelo painel" });
    if (error) throw new Error(`Erro ao cancelar pedido: ${error.message}`);
  } else {
    const { error } = await supabase.rpc("update_order_status", {
      p_order_id: orderId,
      p_status: status,
      p_label: statusLabel,
      p_note: note || null,
      p_tracking: extras.tracking || null,
      p_tracking_url: extras.trackingUrl || null,
    });
    if (error) throw new Error(`Erro ao atualizar pedido: ${error.message}`);
  }
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Pedido não encontrado após atualização.");
  return order;
}

export async function getOrderStats() {
  const orders = await listOrders({ limit: 500 });
  const revenue = orders.filter((order) => ["paid", "preparing", "ready_for_pickup", "ready_to_ship", "shipped", "delivered"].includes(order.status)).reduce((sum, order) => sum + order.total, 0);
  return {
    total: orders.length,
    pending: orders.filter((order) => order.status === "pending_payment").length,
    paid: orders.filter((order) => order.status === "paid").length,
    open: orders.filter((order) => ["paid", "preparing", "ready_for_pickup", "ready_to_ship", "shipped"].includes(order.status)).length,
    revenue,
  };
}
