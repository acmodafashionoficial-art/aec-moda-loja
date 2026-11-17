import Image from "next/image";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminDeleteButton } from "@/components/admin-delete-button";
import { formatBRL } from "@/lib/currency";
import { requireAdminPage } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { usingSupabase } from "@/lib/product-repository";
import { getOrderStats } from "@/lib/order-repository";
import { getPaymentSettings } from "@/lib/payment-settings";
import { getAnalyticsDashboardStats } from "@/lib/analytics-repository";
import {
  getUnreadAdminNotificationCount,
  getUnreadAdminNotifications,
} from "@/lib/admin-notifications";

export const dynamic = "force-dynamic";

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}

function percent(value: number, maximum: number) {
  if (maximum <= 0 || value <= 0) return 4;
  return Math.max(8, Math.round((value / maximum) * 100));
}

function notificationDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(value));
}

export default async function AdminPage() {
  await requireAdminPage();

  const [
    products,
    orderStats,
    paymentSettings,
    analytics,
    notifications,
    unreadNotificationCount,
  ] = await Promise.all([
    getProducts(true),
    getOrderStats(),
    getPaymentSettings(),
    getAnalyticsDashboardStats(),
    getUnreadAdminNotifications(5),
    getUnreadAdminNotificationCount(),
  ]);

  const activeProducts = products.filter((product) => product.active);
  const stock = products.reduce((sum, product) => sum + product.stock, 0);
  const maxDailyViews = Math.max(
    1,
    ...analytics.daily.map((point) => point.pageViews),
  );
  const conversion30 = analytics.last30Days.visitors
    ? (analytics.last30Days.orderSuccesses / analytics.last30Days.visitors) * 100
    : 0;
  const productBySlug = new Map(products.map((product) => [product.slug, product]));

  return (
    <AdminShell active="dashboard">
      <div className="admin-heading">
        <div><span className="eyebrow">PAINEL</span><h1>Visão geral</h1><p>Gerencie a loja sem precisar alterar códigos.</p></div>
        <div className="admin-heading-actions"><Link href="/admin/pedidos" className="button button-outline">Ver pedidos</Link><Link href="/admin/produtos/novo" className="button button-dark">+ Novo produto</Link></div>
      </div>

      {!usingSupabase() && (
        <div className="admin-mode-banner"><strong>Modo local de teste</strong><span>As alterações estão sendo salvas neste computador. Antes de publicar na internet, conectaremos o Supabase.</span></div>
      )}
      {!paymentSettings.checkoutEnabled && (
        <div className="admin-mode-banner warning"><strong>Pagamento desativado</strong><span>Configure a InfiniteTag e ative o checkout em <Link href="/admin/pagamentos">Pagamentos</Link>.</span></div>
      )}

      {unreadNotificationCount > 0 && (
        <section
          className="admin-panel"
          style={{
            borderColor: "rgba(37,99,235,.32)",
            background: "linear-gradient(135deg, rgba(37,99,235,.08), rgba(22,163,74,.05))",
          }}
        >
          <div className="admin-panel-title">
            <div>
              <h2>
                🔔 {unreadNotificationCount} notificação
                {unreadNotificationCount === 1 ? "" : "ões"} nova
                {unreadNotificationCount === 1 ? "" : "s"}
              </h2>
              <span>
                Novos pedidos e pagamentos confirmados aparecem aqui até você
                abrir a tela de pedidos.
              </span>
            </div>
            <Link href="/admin/pedidos" className="admin-small-button">
              Ver pedidos
            </Link>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {notifications.map((notification) => (
              <Link
                href={`/admin/pedidos/${notification.orderId}`}
                key={notification.id}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border:
                    notification.kind === "payment_approved"
                      ? "1px solid rgba(22,163,74,.28)"
                      : "1px solid rgba(37,99,235,.28)",
                  background:
                    notification.kind === "payment_approved"
                      ? "rgba(22,163,74,.06)"
                      : "rgba(37,99,235,.06)",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <strong>
                  {notification.kind === "payment_approved" ? "✅ " : "🛍️ "}
                  {notification.title}
                </strong>
                {notification.message && <span>{notification.message}</span>}
                <small>{notificationDate(notification.createdAt)}</small>
              </Link>
            ))}

            {unreadNotificationCount > notifications.length && (
              <small>
                + {unreadNotificationCount - notifications.length} outra
                {unreadNotificationCount - notifications.length === 1 ? "" : "s"} notificação
                {unreadNotificationCount - notifications.length === 1 ? "" : "ões"}.
              </small>
            )}
          </div>
        </section>
      )}

      <div className="stat-grid">
        <div><span>Produtos publicados</span><strong>{activeProducts.length}</strong><small>de {products.length} cadastrados</small></div>
        <div><span>Estoque total</span><strong>{stock}</strong><small>unidades disponíveis</small></div>
        <div><span>Estoque baixo</span><strong>{products.filter((product) => product.stock <= 3).length}</strong><small>produtos com até 3 unidades</small></div>
        <div><span>Pedidos em andamento</span><strong>{orderStats.open}</strong><small>{orderStats.pending} aguardando pagamento • {formatBRL(orderStats.revenue)} recebidos</small></div>
      </div>

      <section className="admin-panel analytics-panel" aria-labelledby="analytics-title">
        <div className="admin-panel-title">
          <div>
            <h2 id="analytics-title">Estatísticas da loja</h2>
            <span>Acessos anônimos, interesse nos produtos e caminho até a compra</span>
          </div>
          <span className="analytics-live-pill">Atualização automática</span>
        </div>

        <div className="analytics-kpi-grid">
          <div>
            <span>Visitantes hoje</span>
            <strong>{analytics.today.visitors}</strong>
            <small>{analytics.today.pageViews} páginas visualizadas</small>
          </div>
          <div>
            <span>Últimos 7 dias</span>
            <strong>{analytics.last7Days.visitors}</strong>
            <small>{analytics.last7Days.pageViews} visualizações</small>
          </div>
          <div>
            <span>Últimos 30 dias</span>
            <strong>{analytics.last30Days.visitors}</strong>
            <small>visitantes únicos aproximados</small>
          </div>
          <div>
            <span>Adições à sacola</span>
            <strong>{analytics.last30Days.addToCarts}</strong>
            <small>nos últimos 30 dias</small>
          </div>
          <div>
            <span>Conversão aproximada</span>
            <strong>{conversion30.toFixed(1).replace(".", ",")}%</strong>
            <small>{analytics.last30Days.orderSuccesses} chegada(s) à confirmação</small>
          </div>
        </div>

        <div className="analytics-main-grid">
          <div className="analytics-card">
            <div className="analytics-card-heading">
              <div><strong>Acessos nos últimos 7 dias</strong><small>Visualizações de páginas por dia</small></div>
              <b>{analytics.last7Days.pageViews}</b>
            </div>

            {analytics.daily.length ? (
              <div className="analytics-chart" role="img" aria-label="Gráfico de visualizações dos últimos sete dias">
                {analytics.daily.map((point) => (
                  <div className="analytics-bar-column" key={point.date}>
                    <span className="analytics-bar-value">{point.pageViews}</span>
                    <div className="analytics-bar-track">
                      <span
                        className="analytics-bar"
                        style={{ height: `${percent(point.pageViews, maxDailyViews)}%` }}
                      />
                    </div>
                    <small>{shortDate(point.date)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="analytics-empty">Os primeiros acessos aparecerão aqui após a publicação.</p>
            )}
          </div>

          <div className="analytics-card">
            <div className="analytics-card-heading">
              <div><strong>Produtos mais vistos</strong><small>Últimos 30 dias</small></div>
              <b>{analytics.last30Days.productViews}</b>
            </div>

            {analytics.topProducts.length ? (
              <div className="analytics-ranking">
                {analytics.topProducts.map((item, index) => {
                  const product = productBySlug.get(item.slug);
                  return (
                    <div key={item.slug}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{product?.name || item.slug}</strong>
                        <small>{item.views} visualização(ões)</small>
                      </div>
                      {product && <Link href={`/produto/${product.slug}`} target="_blank">Abrir</Link>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="analytics-empty">Ainda não há visualizações de produtos registradas.</p>
            )}
          </div>
        </div>

        <div className="analytics-funnel">
          <div><span>Visitas</span><strong>{analytics.last30Days.pageViews}</strong><small>páginas abertas</small></div>
          <i>→</i>
          <div><span>Produtos</span><strong>{analytics.last30Days.productViews}</strong><small>visualizações</small></div>
          <i>→</i>
          <div><span>Sacola</span><strong>{analytics.last30Days.addToCarts}</strong><small>adições</small></div>
          <i>→</i>
          <div><span>Checkout</span><strong>{analytics.last30Days.checkoutStarts}</strong><small>inícios</small></div>
          <i>→</i>
          <div><span>Confirmação</span><strong>{analytics.last30Days.orderSuccesses}</strong><small>chegadas à página de sucesso</small></div>
        </div>

        <p className="analytics-privacy-note">
          Visitantes são estimados por um identificador aleatório do navegador. O painel não grava nome, e-mail, telefone ou endereço para gerar essas estatísticas.
        </p>
      </section>

      <div className="admin-panel" id="produtos">
        <div className="admin-panel-title"><div><h2>Produtos</h2><span>Fotos, tamanhos, cores e estoque</span></div><Link href="/admin/produtos/novo" className="admin-small-button">Cadastrar produto</Link></div>
        {products.length ? (
          <div className="admin-product-table">
            <div className="admin-product-row header"><span>Produto</span><span>Preço</span><span>Estoque</span><span>Status</span><span>Ações</span></div>
            {products.map((product) => (
              <div className="admin-product-row" key={product.id}>
                <div className="admin-product-cell"><Image src={product.image} alt="" width={52} height={65} /><div><strong>{product.name}</strong><small>{product.category} • {product.sizes.length} tamanhos • {product.colors.length} cores</small></div></div>
                <span>{formatBRL(product.price)}</span>
                <span className={product.stock <= 3 ? "stock-low" : ""}>{product.stock}</span>
                <span><b className={product.active ? "status-pill active" : "status-pill draft"}>{product.active ? "Publicado" : "Rascunho"}</b></span>
                <div className="admin-row-actions"><Link href={`/admin/produtos/${product.id}`}>Editar</Link><AdminDeleteButton id={product.id} name={product.name} /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty"><h3>Nenhum produto cadastrado</h3><p>Cadastre o primeiro produto usando o formulário guiado.</p></div>
        )}
      </div>
    </AdminShell>
  );
}
