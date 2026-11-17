"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrderStatusLabel, ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

export function AdminOrderStatusForm({
  orderId,
  currentStatus,
  tracking,
  trackingUrl,
  fulfillmentType,
  localDelivery = false,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  tracking?: string;
  trackingUrl?: string;
  fulfillmentType: "delivery" | "pickup";
  localDelivery?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [trackingCode, setTrackingCode] = useState(tracking || "");
  const [trackingLink, setTrackingLink] = useState(trackingUrl || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "cancelled" && !window.confirm("Cancelar este pedido? Reservas pendentes serão liberadas.")) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, tracking: trackingCode, trackingUrl: trackingLink }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o pedido.");
      setMessage("Pedido atualizado com sucesso.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const readyStatus: OrderStatus = fulfillmentType === "pickup" ? "ready_for_pickup" : "ready_to_ship";
  const standardTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    pending_payment: ["cancelled"], checkout_error: ["cancelled"], payment_failed: ["cancelled"], expired: ["cancelled"],
    paid: ["preparing", readyStatus, "cancelled"], preparing: [readyStatus, "cancelled"],
    ready_for_pickup: ["delivered", "cancelled"], ready_to_ship: ["shipped", "cancelled"], shipped: ["delivered"],
    delivered: [], cancelled: [],
  };
  const localTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    pending_payment: ["cancelled"], checkout_error: ["cancelled"], payment_failed: ["cancelled"], expired: ["cancelled"],
    paid: ["preparing", "cancelled"], preparing: ["shipped", "cancelled"], shipped: ["delivered"],
    delivered: [], cancelled: [],
  };
  const transitions = localDelivery ? localTransitions : standardTransitions;
  const statuses = [...new Set([currentStatus, ...(transitions[currentStatus] || [])])].filter((value) => ORDER_STATUSES.includes(value));
  const remoteDelivery = fulfillmentType === "delivery" && !localDelivery;

  return (
    <form className="admin-order-action-form" onSubmit={submit}>
      <h2>Atualizar pedido</h2>
      <label>Status
        <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>
          {statuses.map((value) => <option value={value} key={value}>{getOrderStatusLabel(value, fulfillmentType, localDelivery)}</option>)}
        </select>
      </label>
      {remoteDelivery && <>
        <label>Código de rastreamento
          <input value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="Ex.: AA123456789BR" />
        </label>
        <label>Link de rastreamento
          <input value={trackingLink} onChange={(event) => setTrackingLink(event.target.value)} placeholder="https://..." />
        </label>
      </>}
      <label>Observação interna
        <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder={localDelivery ? "Ex.: entrega combinada para hoje à tarde" : "Informação para a equipe da loja"} />
      </label>
      {message && <p className={message.includes("sucesso") ? "success-text" : "form-error"}>{message}</p>}
      <button className="button button-dark button-full" disabled={loading}>{loading ? "Salvando…" : "Salvar atualização"}</button>
    </form>
  );
}
