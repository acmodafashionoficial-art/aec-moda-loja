"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  InStoreSaleResult,
  InventoryPaymentMethod,
  InventoryUnitView,
} from "@/lib/inventory-repository";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const paymentOptions: Array<{
  value: InventoryPaymentMethod;
  label: string;
}> = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "outro", label: "Outro" },
];

export function InStoreSaleForm({ unit }: { unit: InventoryUnitView }) {
  const [paymentMethod, setPaymentMethod] =
    useState<InventoryPaymentMethod>("pix");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sale, setSale] = useState<InStoreSaleResult | null>(null);

  const available = unit.status === "available" && !sale;

  async function submitSale() {
    if (
      !window.confirm(
        `Confirmar a venda de ${unit.productName}, ${unit.color}, tamanho ${unit.size}, por ${money.format(unit.price)}?`,
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/inventory/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: unit.code,
          paymentMethod,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || "Não foi possível registrar a venda.",
        );
      }

      setSale(payload.sale);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível registrar a venda.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (sale) {
    return (
      <div
        style={{
          display: "grid",
          gap: 14,
          padding: 22,
          borderRadius: 16,
          background: "#eef9f1",
          border: "1px solid #b9dfc3",
        }}
      >
        <span className="eyebrow">VENDA REGISTRADA</span>
        <h2 style={{ margin: 0 }}>Estoque atualizado com sucesso</h2>
        <p style={{ margin: 0 }}>
          A peça <strong>{sale.unitCode}</strong> foi vendida e removida
          do estoque disponível.
        </p>
        <p style={{ margin: 0 }}>
          Comprovante interno: <strong>{sale.salePublicCode}</strong>
        </p>
        <div>
          <Link href="/admin/etiquetas" className="button button-dark">
            Voltar para etiquetas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {unit.status !== "available" && (
        <div className="admin-mode-banner warning">
          <strong>Esta etiqueta já foi utilizada</strong>
          <span>
            O estado atual desta peça é: {unit.status}. Nenhuma nova baixa
            será realizada.
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
        }}
      >
        <div className="admin-panel">
          <span>Produto</span>
          <h3>{unit.productName}</h3>
        </div>
        <div className="admin-panel">
          <span>Cor e tamanho</span>
          <h3>
            {unit.color} • {unit.size}
          </h3>
        </div>
        <div className="admin-panel">
          <span>Preço</span>
          <h3>{money.format(unit.price)}</h3>
        </div>
        <div className="admin-panel">
          <span>Código da peça</span>
          <h3>{unit.code}</h3>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <h2>Confirmar venda presencial</h2>
            <span>
              Selecione como o cliente pagou antes de dar baixa.
            </span>
          </div>
        </div>

        <label
          style={{
            display: "grid",
            gap: 8,
            maxWidth: 420,
            marginBottom: 18,
          }}
        >
          <strong>Forma de pagamento</strong>
          <select
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(
                event.target.value as InventoryPaymentMethod,
              )
            }
            disabled={!available || loading}
            style={{
              minHeight: 48,
              padding: "0 13px",
              border: "1px solid rgba(0,0,0,.18)",
              borderRadius: 10,
              background: "#fff",
            }}
          >
            {paymentOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <div className="admin-mode-banner warning">
            <strong>Não foi possível concluir</strong>
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          className="button button-dark"
          disabled={!available || loading}
          onClick={submitSale}
        >
          {loading
            ? "Registrando..."
            : "Confirmar pagamento e dar baixa"}
        </button>
      </div>
    </div>
  );
}
