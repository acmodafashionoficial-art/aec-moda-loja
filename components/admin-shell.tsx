import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth";
import { getUnreadAdminNotificationCount } from "@/lib/admin-notifications";

export async function AdminShell({
  active,
  children,
}: {
  active:
    | "dashboard"
    | "products"
    | "orders"
    | "inventory"
    | "investors"
    | "settings"
    | "logistics"
    | "shipping"
    | "payments"
    | "supabase"
    | "security"
    | "users"
    | "account";
  children: React.ReactNode;
}) {
  const [session, unreadNotifications] = await Promise.all([
    getAdminSession(),
    getUnreadAdminNotificationCount(),
  ]);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-logo">
          <strong>A&amp;C</strong>
          <span>PAINEL DA LOJA</span>
        </Link>

        {session && (
          <div className="admin-session-user">
            <strong>{session.displayName}</strong>
            <span>
              {session.legacy
                ? "Configuração inicial"
                : session.email}
            </span>
            <small>
              {session.role === "owner"
                ? "Proprietária"
                : "Administradora"}
            </small>
          </div>
        )}

        <nav>
          <Link
            className={active === "dashboard" ? "active" : ""}
            href="/admin"
          >
            Visão geral
          </Link>
          <Link
            className={active === "products" ? "active" : ""}
            href="/admin#produtos"
          >
            Produtos
          </Link>
          <Link
            className={active === "orders" ? "active" : ""}
            href="/admin/pedidos"
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Pedidos
              {unreadNotifications > 0 && (
                <b
                  aria-label={`${unreadNotifications} notificação(ões) nova(s)`}
                  title={`${unreadNotifications} notificação(ões) nova(s)`}
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: "0 6px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 900,
                    lineHeight: 1,
                    boxShadow: "0 0 0 2px rgba(220,38,38,.15)",
                  }}
                >
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </b>
              )}
            </span>
          </Link>
          <Link
            className={active === "inventory" ? "active" : ""}
            href="/admin/etiquetas"
          >
            Etiquetas e vendas
          </Link>
          <Link
            className={active === "investors" ? "active" : ""}
            href="/admin/investidores"
          >
            Investidores e rodízio
          </Link>
          <Link
            className={active === "settings" ? "active" : ""}
            href="/admin/configuracoes"
          >
            Personalização
          </Link>
          <Link
            className={active === "logistics" ? "active" : ""}
            href="/admin/logistica"
          >
            Pesos e embalagens
          </Link>
          <Link
            className={active === "shipping" ? "active" : ""}
            href="/admin/fretes"
          >
            Fretes e Correios
          </Link>
          <Link
            className={active === "payments" ? "active" : ""}
            href="/admin/pagamentos"
          >
            Pagamentos
          </Link>
          <Link
            className={active === "supabase" ? "active" : ""}
            href="/admin/supabase"
          >
            Dados na nuvem
          </Link>
          {session?.role === "owner" && (
            <Link
              className={active === "users" ? "active" : ""}
              href="/admin/usuarios"
            >
              Contas e acessos
            </Link>
          )}
          <Link
            className={active === "security" ? "active" : ""}
            href="/admin/seguranca"
          >
            Segurança
          </Link>
          <Link
            className={active === "account" ? "active" : ""}
            href="/admin/minha-conta"
          >
            Minha conta
          </Link>
          <Link href="/" target="_blank">
            Abrir loja ↗
          </Link>
        </nav>

        <div className="admin-sidebar-help">
          <strong>Modo fácil</strong>
          <span>
            Fotos, aparência, frete e estoque são padronizados
            automaticamente.
          </span>
        </div>

        <form action="/api/admin/logout" method="post">
          <button className="admin-logout" type="submit">
            Sair do painel
          </button>
        </form>
      </aside>

      <section className="admin-content">{children}</section>
    </div>
  );
}
