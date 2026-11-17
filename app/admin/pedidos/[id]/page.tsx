import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOrderStatusForm } from "@/components/admin-order-status-form";
import { PrintButton } from "@/components/print-button";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { formatBRL } from "@/lib/currency";
import { getOrderById } from "@/lib/order-repository";
import { getOrderStatusLabel, isLocalDeliveryService } from "@/lib/order-types";
import { buildWhatsAppUrl, localDeliveryStoreMessage, pickupStoreMessage } from "@/lib/contact-links";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Recife" }).format(new Date(value));
}

export default async function OrderDetailsPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();

  const address = order.shippingAddress;
  const shipping = order.shippingService || {};
  const localDelivery = isLocalDeliveryService(order.shippingService);
  const customerWhatsappUrl = order.fulfillmentType === "pickup"
    ? buildWhatsAppUrl(order.customerPhone, pickupStoreMessage(order.customerName, order.publicCode, order.status === "ready_for_pickup"))
    : localDelivery
      ? buildWhatsAppUrl(order.customerPhone, localDeliveryStoreMessage(order.customerName, order.publicCode, order.status === "shipped"))
      : "";
  const receivingLabel = order.fulfillmentType === "pickup" ? "Retirada" : localDelivery ? "Entrega local" : "Entrega";

  return <AdminShell active="orders">
    <div className="admin-heading compact no-print">
      <div><span className="eyebrow">PEDIDO {order.publicCode}</span><h1>Detalhes do pedido</h1><p>Criado em {formatDate(order.createdAt)}</p></div>
      <div className="admin-heading-actions"><Link href="/admin/pedidos" className="button button-outline">← Pedidos</Link><PrintButton /></div>
    </div>

    <div className="admin-order-detail">
      <div className="admin-order-main">
        <section className="admin-form-card order-print-header">
          <div><span className="eyebrow">A&C MODA</span><h2>{order.publicCode}</h2></div>
          <b className={`order-status status-${order.status}`}>{getOrderStatusLabel(order.status, order.fulfillmentType, localDelivery)}</b>
        </section>

        <section className="admin-form-card">
          <h2>Produtos</h2>
          <div className="order-items-list">{order.items.map((item, index) => <article key={`${item.variantId || item.sku}-${index}`}>
            <div className="order-item-image">{item.image ? <Image src={item.image} alt="" fill sizes="72px" /> : <span>SEM FOTO</span>}</div>
            <div><strong>{item.quantity}× {item.name}</strong><small>{item.size} • {item.color}{item.sku ? ` • ${item.sku}` : ""}</small></div>
            <div><small>{formatBRL(item.unitPrice)} cada</small><strong>{formatBRL(item.lineTotal)}</strong></div>
          </article>)}</div>
          <div className="order-total-box">
            <span>Subtotal <b>{formatBRL(order.subtotal)}</b></span>
            <span>{order.fulfillmentType === "pickup" ? "Retirada" : localDelivery ? "Entrega local" : "Frete"} <b>{order.shippingCost ? formatBRL(order.shippingCost) : "Grátis"}</b></span>
            <strong>Total <b>{formatBRL(order.total)}</b></strong>
          </div>
        </section>

        <div className="admin-order-info-grid">
          <section className="admin-form-card">
            <h2>Cliente</h2>
            <p><b>{order.customerName}</b></p><p>{order.customerEmail}</p><p>{order.customerPhone || "Telefone não informado"}</p><p>Documento: {order.customerDocument || "—"}</p>
            {customerWhatsappUrl && <a className="button button-outline admin-contact-button no-print" href={customerWhatsappUrl} target="_blank" rel="noopener noreferrer">{localDelivery ? "Combinar entrega pelo WhatsApp" : "Chamar cliente no WhatsApp"}</a>}
          </section>
          <section className="admin-form-card">
            <h2>{receivingLabel}</h2>
            {order.fulfillmentType === "pickup" ? <>
              <p><b>{text(address.address)}</b></p><p>{text(address.instructions)}</p>
            </> : <>
              <p><b>{text(address.street)}, {text(address.number)}</b></p>
              <p>{text(address.neighborhood)} — {text(address.city)}/{text(address.state)}</p>
              <p>CEP: {text(address.postalCode)}</p>
              {text(address.complement) && <p>Complemento: {text(address.complement)}</p>}
              {localDelivery && text(address.reference) && <p><b>Ponto de referência:</b> {text(address.reference)}</p>}
            </>}
            <hr />
            <p><b>{text(shipping.company || shipping.name)}</b></p>
            <p>{text(shipping.deliveryLabel || shipping.instructions)}</p>
            {localDelivery && text(shipping.supportHours) && <p>Atendimento: {text(shipping.supportHours)}</p>}
          </section>
        </div>

        <section className="admin-form-card"><h2>Histórico</h2><div className="order-timeline">{(order.events || []).length ? order.events?.map((event) => <article key={event.id}><span></span><div><strong>{event.label}</strong><small>{formatDate(event.createdAt)}</small>{event.note && <p>{event.note}</p>}</div></article>) : <p>Nenhum evento registrado.</p>}</div></section>
      </div>

      <aside className="admin-order-side no-print">
        <AdminOrderStatusForm orderId={order.id} currentStatus={order.status} tracking={order.shippingTracking} trackingUrl={order.shippingTrackingUrl} fulfillmentType={order.fulfillmentType} localDelivery={localDelivery} />
        <div className="admin-form-card">
          <h2>Pagamento</h2>
          <p>Provedor: <b>{order.paymentProvider === "infinitepay" ? "InfinitePay" : order.paymentProvider || "Aguardando"}</b></p>
          <p>Status: <b>{order.paymentStatusDetail || getOrderStatusLabel(order.status, order.fulfillmentType, localDelivery)}</b></p>
          <p>Transação: {order.paymentId || "Aguardando"}</p>
          {order.paymentMethod && <p>Método: <b>{order.paymentMethod === "pix" ? "Pix" : order.paymentMethod === "credit_card" ? "Cartão de crédito" : order.paymentMethod}</b></p>}
          {order.paymentInstallments && <p>Parcelas: <b>{order.paymentInstallments}x</b></p>}
          {order.paidAmount != null && <p>Valor confirmado: <b>{formatBRL(order.paidAmount)}</b></p>}
          {order.paidAt && <p>Pago em {formatDate(order.paidAt)}</p>}
          {order.paymentReceiptUrl && <a href={order.paymentReceiptUrl} target="_blank" rel="noreferrer">Abrir comprovante ↗</a>}
        </div>
        {!localDelivery && order.shippingTracking && <div className="admin-form-card"><h2>Rastreamento</h2><p><b>{order.shippingTracking}</b></p>{order.shippingTrackingUrl && <a href={order.shippingTrackingUrl} target="_blank" rel="noreferrer">Abrir rastreamento ↗</a>}</div>}
      </aside>
    </div>
  </AdminShell>;
}
