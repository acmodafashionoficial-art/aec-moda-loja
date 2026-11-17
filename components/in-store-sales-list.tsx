"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InStoreSaleView, InventoryPaymentMethod } from "@/lib/inventory-repository";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const paymentLabels: Record<InventoryPaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};

export function InStoreSalesList({ sales }: { sales: InStoreSaleView[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

  async function cancelSale(sale: InStoreSaleView) {
    const reason = window.prompt(
      `Informe o motivo do cancelamento da venda ${sale.publicCode}:`,
      "Cancelamento de venda presencial",
    );
    if (reason === null) return;

    const confirmed = window.confirm(
      "Ao cancelar, a peça voltará para o estoque disponível. Deseja continuar?",
    );
    if (!confirmed) return;

    setLoadingId(sale.id);
    setError("");

    try {
      const response = await fetch(`/api/admin/inventory/sales/${sale.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível cancelar a venda.");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível cancelar a venda.",
      );
    } finally {
      setLoadingId("");
    }
  }

  if (!sales.length) {
    return (
      <div className="admin-empty">
        <h3>Nenhuma venda presencial registrada</h3>
        <p>As vendas confirmadas pelo QR Code aparecerão nesta página.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error && (
        <div className="admin-mode-banner warning">
          <strong>Não foi possível concluir</strong>
          <span>{error}</span>
        </div>
      )}

      {sales.map((sale) => (
        <article className="admin-panel" key={sale.id} style={{ margin: 0 }}>
          <div className="admin-panel-title">
            <div>
              <h2>{sale.publicCode}</h2>
              <span>
                {dateTime.format(new Date(sale.createdAt))} •{" "}
                {paymentLabels[sale.paymentMethod]} • {money.format(sale.total)}
              </span>
            </div>

            <b className={sale.status === "paid" ? "status-pill active" : "status-pill draft"}>
              {sale.status === "paid" ? "Concluída" : "Cancelada"}
            </b>
          </div>

          <div style={{ display: "grid", gap: 9 }}>
            {sale.items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(0,0,0,.08)",
                }}
              >
                <div style={{ display: "grid", gap: 3 }}>
                  <strong>{item.productName}</strong>
                  <small>{item.color} • Tamanho {item.size} • {item.sku}</small>
                </div>
                <strong>{money.format(item.unitPrice)}</strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 16,
            }}
          >
            <small>
              Registrada por: {sale.soldByEmail || "Administrador"}
              {sale.cancelledAt && (
                <> • Cancelada em {dateTime.format(new Date(sale.cancelledAt))}</>
              )}
              {sale.cancellationReason && <> • Motivo: {sale.cancellationReason}</>}
            </small>

            {sale.status === "paid" && (
              <button
                type="button"
                className="button button-outline"
                disabled={loadingId === sale.id}
                onClick={() => cancelSale(sale)}
              >
                {loadingId === sale.id ? "Cancelando..." : "Cancelar e devolver ao estoque"}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
