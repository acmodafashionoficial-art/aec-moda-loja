"use client";

import { FormEvent, useState } from "react";
import { formatBRL } from "@/lib/currency";
import { getOrderStatusLabel, isLocalDeliveryService, type StoreOrder } from "@/lib/order-types";
import { buildWhatsAppUrl, localDeliveryCustomerMessage, pickupCustomerMessage } from "@/lib/contact-links";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function OrderTracker({ whatsappNumber, instagramUrl }: { whatsappNumber: string; instagramUrl: string }) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pedido não encontrado.");
      setOrder(data.order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const localDelivery = Boolean(order && isLocalDeliveryService(order.shippingService));
  const pickupReady = order?.status === "ready_for_pickup";
  const outForDelivery = order?.status === "shipped";
  const pickupWhatsappUrl = order?.fulfillmentType === "pickup"
    ? buildWhatsAppUrl(whatsappNumber, pickupCustomerMessage(order.publicCode, pickupReady))
    : "";
  const localWhatsappUrl = localDelivery && order
    ? buildWhatsAppUrl(whatsappNumber, localDeliveryCustomerMessage(order.publicCode, outForDelivery))
    : "";
  const pickupContactUrl = pickupWhatsappUrl || (order?.fulfillmentType === "pickup" ? instagramUrl : "");
  const localContactUrl = localWhatsappUrl || (localDelivery ? instagramUrl : "");

  return <div className="tracking-layout">
    <form className="tracking-form" onSubmit={submit}>
      <h2>Consulte seu pedido</h2>
      <p>Use o código recebido após a compra e o mesmo e-mail informado no checkout.</p>
      <label>Código do pedido<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="AEC-2607-ABC123" required /></label>
      <label>E-mail da compra<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seuemail@exemplo.com" required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button-dark button-full" disabled={loading}>{loading ? "Consultando…" : "Acompanhar pedido"}</button>
    </form>

    {order ? <section className="tracking-result">
      <div className="tracking-result-head"><div><span>Pedido</span><h2>{order.publicCode}</h2></div><b className={`order-status status-${order.status}`}>{getOrderStatusLabel(order.status, order.fulfillmentType, localDelivery)}</b></div>
      <p>Realizado em {formatDate(order.createdAt)}</p>
      <div className="tracking-items">{order.items.map((item, index) => <div key={`${item.sku}-${index}`}><span>{item.quantity}× {item.name}<small>{item.size} • {item.color}</small></span><strong>{formatBRL(item.lineTotal)}</strong></div>)}</div>
      <div className="tracking-total"><span>Total</span><strong>{formatBRL(order.total)}</strong></div>
      {order.fulfillmentType === "pickup" ? <div className="tracking-delivery">
        <strong>Retirada na loja</strong>
        <p>{String(order.shippingAddress.address || "")}</p>
        <p>{String(order.shippingAddress.instructions || "")}</p>
        {pickupContactUrl && <a className="button button-outline" href={pickupContactUrl} target="_blank" rel="noopener noreferrer">{pickupWhatsappUrl ? "Combinar retirada pelo WhatsApp" : "Combinar retirada pelo Instagram"}</a>}
      </div> : localDelivery ? <div className="tracking-delivery local-delivery-tracking">
        <strong>Entrega local grátis em Jataúba</strong>
        <p>{String(order.shippingService?.deliveryLabel || "A loja confirmará a entrega pelo WhatsApp.")}</p>
        {Boolean(order.shippingService?.supportHours) && <p>Atendimento: {String(order.shippingService?.supportHours)}</p>}
        {localContactUrl && <a className="button button-outline" href={localContactUrl} target="_blank" rel="noopener noreferrer">{localWhatsappUrl ? "Combinar entrega pelo WhatsApp" : "Falar pelo Instagram"}</a>}
      </div> : <div className="tracking-delivery">
        <strong>Entrega</strong>
        <p>{String(order.shippingService?.company || order.shippingService?.name || "Transportadora")}</p>
        <p>{String(order.shippingService?.deliveryLabel || "Prazo informado no checkout")}</p>
        {order.shippingTracking && <><p>Código: <b>{order.shippingTracking}</b></p>{order.shippingTrackingUrl && <a href={order.shippingTrackingUrl} target="_blank" rel="noreferrer">Abrir rastreamento ↗</a>}</>}
      </div>}
      <div className="order-timeline public-timeline">{(order.events || []).map((event) => <article key={event.id}><span></span><div><strong>{event.label}</strong><small>{formatDate(event.createdAt)}</small></div></article>)}</div>
    </section> : <section className="tracking-placeholder"><strong>Acompanhamento seguro</strong><p>Os dados do pedido só aparecem quando o código e o e-mail conferem.</p></section>}
  </div>;
}
