import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import {
  getUnreadAdminNotifications,
  markOrderNotificationsRead,
} from "@/lib/admin-notifications";
import { formatBRL } from "@/lib/currency";
import { listOrders } from "@/lib/order-repository";
import {
  getOrderStatusLabel,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  isLocalDeliveryService,
  isOrderStatus,
} from "@/lib/order-types";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ status?: string; q?: string }> };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(value));
}

export default async function OrdersPage({ searchParams }: Props) {
  await requireAdminPage();

  const params = await searchParams;
  const status = isOrderStatus(params.status) ? params.status : undefined;

  const [orders, unreadNotifications] = await Promise.all([
    listOrders({ status, search: params.q, limit: 300 }),
    getUnreadAdminNotifications(300),
  ]);

  const orderNotifications = unreadNotifications.filter(
    (notification) => notification.orderId,
  );

  const newOrderIds = new Set(
    orderNotifications
      .filter((notification) => notification.kind === "new_order")
      .map((notification) => notification.orderId),
  );

  const paidOrderIds = new Set(
    orderNotifications
      .filter((notification) => notification.kind === "payment_approved")
      .map((notification) => notification.orderId),
  );

  if (orderNotifications.length) {
    await markOrderNotificationsRead();
  }

  return (
    <AdminShell active="orders">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">VENDAS</span>
          <h1>Pedidos</h1>
          <p>Acompanhe pagamento, separação, retirada e envio.</p>
        </div>
      </div>

      {orderNotifications.length > 0 && (
        <div
          className="admin-mode-banner"
          style={{
            borderColor: "rgba(37,99,235,.35)",
            background: "rgba(37,99,235,.08)",
          }}
        >
          <strong>
            🔔 {orderNotifications.length} notificação
            {orderNotifications.length === 1 ? "" : "ões"} nova
            {orderNotifications.length === 1 ? "" : "s"}
          </strong>
          <span>
            Os pedidos destacados abaixo acabaram de ser visualizados. Ao sair
            desta página, o contador de novas notificações ficará limpo.
          </span>
        </div>
      )}

      <form className="admin-order-filters" method="get">
        <label>
          Pesquisar
          <input
            name="q"
            defaultValue={params.q || ""}
            placeholder="Código, nome, e-mail ou telefone"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status || ""}>
            <option value="">Todos os status</option>
            {ORDER_STATUSES.map((value) => (
              <option value={value} key={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-dark">Filtrar</button>
        <Link href="/admin/pedidos" className="button button-outline">
          Limpar
        </Link>
      </form>

      <div className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <h2>
              {orders.length} pedido{orders.length === 1 ? "" : "s"}
            </h2>
            <span>Os mais recentes aparecem primeiro.</span>
          </div>
        </div>

        {orders.length ? (
          <div className="admin-orders-table">
            <div className="admin-orders-row header">
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Recebimento</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>

            {orders.map((order) => {
              const localDelivery = isLocalDeliveryService(order.shippingService);
              const isNew = newOrderIds.has(order.id);
              const isPaidNow = paidOrderIds.has(order.id);

              return (
                <div
                  className="admin-orders-row"
                  key={order.id}
                  style={
                    isPaidNow
                      ? {
                          background: "rgba(22,163,74,.07)",
                          boxShadow: "inset 4px 0 0 #16a34a",
                        }
                      : isNew
                        ? {
                            background: "rgba(37,99,235,.07)",
                            boxShadow: "inset 4px 0 0 #2563eb",
                          }
                        : undefined
                  }
                >
                  <div>
                    <strong>{order.publicCode}</strong>
                    <small>{formatDate(order.createdAt)}</small>

                    {(isNew || isPaidNow) && (
                      <span
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 5,
                          marginTop: 6,
                        }}
                      >
                        {isNew && (
                          <b
                            style={{
                              width: "fit-content",
                              padding: "3px 7px",
                              borderRadius: 999,
                              background: "#2563eb",
                              color: "#fff",
                              fontSize: 9,
                              letterSpacing: ".04em",
                            }}
                          >
                            NOVO PEDIDO
                          </b>
                        )}

                        {isPaidNow && (
                          <b
                            style={{
                              width: "fit-content",
                              padding: "3px 7px",
                              borderRadius: 999,
                              background: "#16a34a",
                              color: "#fff",
                              fontSize: 9,
                              letterSpacing: ".04em",
                            }}
                          >
                            PAGAMENTO CONFIRMADO
                          </b>
                        )}
                      </span>
                    )}
                  </div>

                  <div>
                    <strong>{order.customerName}</strong>
                    <small>{order.customerEmail}</small>
                  </div>

                  <span>
                    {order.fulfillmentType === "pickup"
                      ? "Retirada"
                      : localDelivery
                        ? "Entrega local"
                        : "Transportadora"}
                  </span>

                  <strong>{formatBRL(order.total)}</strong>

                  <span>
                    <b className={`order-status status-${order.status}`}>
                      {getOrderStatusLabel(
                        order.status,
                        order.fulfillmentType,
                        localDelivery,
                      )}
                    </b>
                  </span>

                  <Link href={`/admin/pedidos/${order.id}`}>
                    Ver pedido →
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="admin-empty">
            <h3>Nenhum pedido encontrado</h3>
            <p>Altere os filtros ou faça uma compra de teste.</p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
