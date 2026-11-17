"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type RuleMode = "none" | "percent" | "fixed";
type FinanceTab = "summary" | "history" | "sales" | "moves" | "products" | "rules";
type TransactionKind = "income" | "expense" | "investment" | "withdrawal";

type Settings = {
  openingBalance: number;
  defaultDiscountMode: RuleMode;
  defaultDiscountValue: number;
  defaultPaymentFeeMode: RuleMode;
  defaultPaymentFeeValue: number;
  defaultStoreFeeMode: RuleMode;
  defaultStoreFeeValue: number;
  defaultExtraDeductionMode: RuleMode;
  defaultExtraDeductionValue: number;
  reinvestmentPercent: number;
};

type Sale = {
  id: string;
  lotId: string;
  lotCode: string;
  lotName: string;
  variantId: string;
  productName: string;
  productSlug: string;
  productActive: boolean;
  imageUrl?: string | null;
  size: string;
  color: string;
  sourceType: "store_sale" | "online_order";
  automaticGrossAmount: number;
  grossAmount: number;
  grossAmountOverride: number | null;
  status: "active" | "reversed";
  soldAt: string;
  discountMode: RuleMode;
  discountValue: number;
  discountAmount: number;
  paymentFeeMode: RuleMode;
  paymentFeeValue: number;
  paymentFeeAmount: number;
  storeFeeMode: RuleMode;
  storeFeeValue: number;
  storeFeeAmount: number;
  extraDeductionMode: RuleMode;
  extraDeductionValue: number;
  extraDeductionAmount: number;
  unitCost: number;
  netReceivedOverride: number | null;
  netReceived: number;
  profit: number;
  profitPercent: number | null;
  notes: string;
};

type Transaction = {
  id: string;
  lotId?: string | null;
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  occurredOn: string;
  paymentMethod: string;
  notes: string;
};

type ProductCost = {
  lotId: string;
  lotName: string;
  variantId: string;
  productName: string;
  productSlug: string;
  productActive: boolean;
  imageUrl?: string | null;
  size: string;
  color: string;
  quantityInLot: number;
  unitCost: number;
  plannedPrice: number | null;
  notes: string;
};

type FinanceDashboard = {
  settings: Settings;
  legacy?: any | null;
  summary: {
    grossSales: number;
    discounts: number;
    paymentFees: number;
    storeFees: number;
    extraDeductions: number;
    netSales: number;
    costOfGoodsSold: number;
    salesProfit: number;
    manualIncome: number;
    expenses: number;
    investments: number;
    withdrawals: number;
    profit: number;
    cashBalance: number;
    suggestedReinvestment: number;
  };
  sales: Sale[];
  transactions: Transaction[];
  products: ProductCost[];
  lots: Array<{ id: string; code: string; name: string }>;
  monthly: Array<{ month: string; inflow: number; outflow: number; profit: number }>;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function dateShort(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(parsed) : "—";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ruleLabel(mode: RuleMode) {
  if (mode === "percent") return "%";
  if (mode === "fixed") return "R$";
  return "Sem desconto";
}

function transactionLabel(kind: TransactionKind) {
  if (kind === "income") return "Entrada";
  if (kind === "expense") return "Despesa";
  if (kind === "investment") return "Investimento/compra";
  return "Retirada";
}

function emptyTransaction() {
  return {
    transactionId: "",
    kind: "expense" as TransactionKind,
    category: "",
    description: "",
    amount: "",
    occurredOn: today(),
    paymentMethod: "",
    lotId: "",
    notes: "",
  };
}

function RuleEditor(props: {
  title: string;
  mode: RuleMode;
  value: string;
  onMode: (value: RuleMode) => void;
  onValue: (value: string) => void;
}) {
  return (
    <label className="finance-rule-field">
      <span>{props.title}</span>
      <div>
        <select value={props.mode} onChange={(event) => props.onMode(event.target.value as RuleMode)}>
          <option value="none">Nenhum</option>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor em dinheiro (R$)</option>
        </select>
        <input
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onValue(event.target.value)}
          disabled={props.mode === "none"}
          placeholder={props.mode === "percent" ? "0,00 %" : "R$ 0,00"}
        />
      </div>
    </label>
  );
}

export function InvestorFinance() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null);
  const [tab, setTab] = useState<FinanceTab>("summary");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingSaleId, setEditingSaleId] = useState("");
  const [saleForm, setSaleForm] = useState<any>(null);
  const [transactionForm, setTransactionForm] = useState(emptyTransaction());
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [costDrafts, setCostDrafts] = useState<Record<string, any>>({});

  async function token() {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente no portal.");
    return accessToken;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const accessToken = await token();
      const response = await fetch("/api/investor/finance", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seu caixa.");
      const next = payload.dashboard as FinanceDashboard;
      setDashboard(next);
      setSettingsForm({
        openingBalance: String(next.settings.openingBalance ?? 0),
        defaultDiscountMode: next.settings.defaultDiscountMode,
        defaultDiscountValue: String(next.settings.defaultDiscountValue ?? 0),
        defaultPaymentFeeMode: next.settings.defaultPaymentFeeMode,
        defaultPaymentFeeValue: String(next.settings.defaultPaymentFeeValue ?? 0),
        defaultStoreFeeMode: next.settings.defaultStoreFeeMode,
        defaultStoreFeeValue: String(next.settings.defaultStoreFeeValue ?? 0),
        defaultExtraDeductionMode: next.settings.defaultExtraDeductionMode,
        defaultExtraDeductionValue: String(next.settings.defaultExtraDeductionValue ?? 0),
        reinvestmentPercent: String(next.settings.reinvestmentPercent ?? 0),
      });
      setCostDrafts(Object.fromEntries(next.products.map((item) => [
        `${item.lotId}|||${item.variantId}`,
        { unitCost: String(item.unitCost || 0), plannedPrice: item.plannedPrice == null ? "" : String(item.plannedPrice), notes: item.notes || "", applyExisting: false },
      ])));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Erro ao carregar o caixa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function patch(body: Record<string, unknown>, success: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const accessToken = await token();
      const response = await fetch("/api/investor/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      setMessage(success);
      await load();
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function editSale(sale: Sale) {
    setEditingSaleId(sale.id);
    setSaleForm({
      grossAmountOverride: sale.grossAmountOverride == null ? "" : String(sale.grossAmountOverride),
      discountMode: sale.discountMode,
      discountValue: String(sale.discountValue || 0),
      paymentFeeMode: sale.paymentFeeMode,
      paymentFeeValue: String(sale.paymentFeeValue || 0),
      storeFeeMode: sale.storeFeeMode,
      storeFeeValue: String(sale.storeFeeValue || 0),
      extraDeductionMode: sale.extraDeductionMode,
      extraDeductionValue: String(sale.extraDeductionValue || 0),
      unitCost: String(sale.unitCost || 0),
      netReceivedOverride: sale.netReceivedOverride == null ? "" : String(sale.netReceivedOverride),
      notes: sale.notes || "",
    });
  }

  async function saveSale() {
    if (!saleForm || !editingSaleId) return;
    const ok = await patch({ action: "sale", saleId: editingSaleId, ...saleForm }, "Venda recalculada e salva.");
    if (ok) { setEditingSaleId(""); setSaleForm(null); }
  }

  async function saveSettings() {
    if (!settingsForm) return;
    await patch({ action: "settings", ...settingsForm }, "Regras automáticas salvas. Elas serão usadas como padrão nas próximas vendas.");
  }

  function editTransaction(item: Transaction) {
    setTransactionForm({
      transactionId: item.id,
      kind: item.kind,
      category: item.category,
      description: item.description,
      amount: String(item.amount),
      occurredOn: item.occurredOn,
      paymentMethod: item.paymentMethod || "",
      lotId: item.lotId || "",
      notes: item.notes || "",
    });
    setTab("moves");
  }

  async function saveTransaction() {
    const ok = await patch({ action: "transaction", ...transactionForm }, transactionForm.transactionId ? "Movimentação atualizada." : "Movimentação adicionada ao caixa.");
    if (ok) setTransactionForm(emptyTransaction());
  }

  async function removeTransaction(id: string) {
    if (!window.confirm("Excluir esta movimentação do caixa? O registro ficará preservado no histórico interno.")) return;
    await patch({ action: "void_transaction", transactionId: id }, "Movimentação removida do caixa.");
  }

  async function saveCost(item: ProductCost) {
    const key = `${item.lotId}|||${item.variantId}`;
    const draft = costDrafts[key] || {};
    await patch({
      action: "product_cost",
      lotId: item.lotId,
      variantId: item.variantId,
      unitCost: draft.unitCost,
      plannedPrice: draft.plannedPrice,
      notes: draft.notes,
      applyExisting: Boolean(draft.applyExisting),
    }, "Custo da roupa salvo.");
  }

  if (loading && !dashboard) return <section className="finance-loading">Carregando seu caixa...</section>;
  if (!dashboard) return <section className="finance-error">{error || "Não foi possível carregar o caixa."}</section>;

  const summary = dashboard.summary;
  const maxMonthly = Math.max(1, ...dashboard.monthly.flatMap((row) => [row.inflow, row.outflow]));

  return (
    <section className="finance-shell">
      <div className="finance-heading">
        <div><span>MEU FINANCEIRO</span><h1>Caixa do investidor</h1><p>As vendas entram automaticamente. Você continua livre para corrigir valores, informar custos, aplicar desconto em % ou R$, registrar despesas, investimentos, entradas e retiradas.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading}>↻ Atualizar</button>
      </div>

      {error && <div className="finance-alert error">{error}</div>}
      {message && <div className="finance-alert ok">{message}</div>}

      <nav className="finance-tabs">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Visão geral</button>
        {dashboard.legacy && <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Planilha importada</button>}
        <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>Vendas automáticas</button>
        <button className={tab === "moves" ? "active" : ""} onClick={() => setTab("moves")}>Entradas e gastos</button>
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Custos das roupas</button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>Regras automáticas</button>
      </nav>

      {tab === "summary" && (
        <>
          <div className="finance-kpis">
            <article className="primary"><span>Caixa atual</span><strong>{money(summary.cashBalance)}</strong><small>{dashboard.legacy ? "Saldo da planilha + movimentações após a importação" : "Saldo inicial + recebimentos − saídas"}</small></article>
            <article><span>Lucro acompanhado</span><strong>{money(summary.profit)}</strong><small>{dashboard.legacy ? "Lucro histórico das vendas + movimentos novos" : "Lucro das vendas + entradas − despesas"}</small></article>
            <article><span>Vendas líquidas</span><strong>{money(summary.netSales)}</strong><small>Após descontos e deduções</small></article>
            <article><span>Investido em compras</span><strong>{money(summary.investments)}</strong><small>{dashboard.legacy ? "Total da planilha + novos investimentos" : "Movimentações marcadas como investimento"}</small></article>
            <article><span>Despesas</span><strong>{money(summary.expenses)}</strong><small>Gastos que reduzem o lucro</small></article>
            <article><span>Reinvestimento sugerido</span><strong>{money(summary.suggestedReinvestment)}</strong><small>{dashboard.settings.reinvestmentPercent}% do lucro positivo</small></article>
          </div>

          {dashboard.legacy && (
            <section className="finance-legacy-summary">
              <div className="finance-card-title">
                <span>HISTÓRICO IMPORTADO</span>
                <h2>Seu controle antigo já faz parte do caixa</h2>
                <p>O saldo da planilha foi preservado como ponto de partida. Da data da importação em diante, as novas vendas e lançamentos continuam atualizando o caixa automaticamente.</p>
              </div>
              <div className="finance-legacy-kpis">
                <article><span>Entrada histórica</span><b>{money(dashboard.legacy.summary.historicalInflow)}</b></article>
                <article><span>Saída histórica</span><b>{money(dashboard.legacy.summary.historicalOutflow)}</b></article>
                <article><span>Caixa trazido da planilha</span><b>{money(dashboard.legacy.summary.cashBalance)}</b></article>
                <article><span>Peças compradas</span><b>{numberValue(dashboard.legacy.summary.piecesPurchased)}</b></article>
                <article><span>Peças vendidas</span><b>{numberValue(dashboard.legacy.summary.piecesSold)}</b></article>
                <article><span>Peças disponíveis</span><b>{numberValue(dashboard.legacy.summary.piecesAvailable)}</b></article>
              </div>
              {Math.abs(Number(dashboard.legacy.summary.cashFormulaDifference) || 0) >= 0.01 && (
                <div className="finance-note"><strong>Importante:</strong> a própria planilha informava caixa de {money(dashboard.legacy.summary.cashBalance)}, embora Entrada − Saída resulte em {money(dashboard.legacy.summary.historicalInflow - dashboard.legacy.summary.historicalOutflow)}. Mantive o valor de caixa informado por você, sem alterar o histórico.</div>
              )}
            </section>
          )}

          <div className="finance-grid-two">
            <section className="finance-card">
              <div className="finance-card-title"><span>RESULTADO DAS VENDAS</span><h2>Do bruto ao lucro</h2></div>
              <div className="finance-breakdown">
                <div><span>Venda bruta</span><strong>{money(summary.grossSales)}</strong></div>
                <div><span>Descontos</span><strong>- {money(summary.discounts)}</strong></div>
                <div><span>Taxas de pagamento</span><strong>- {money(summary.paymentFees)}</strong></div>
                <div><span>Parte/taxa da loja</span><strong>- {money(summary.storeFees)}</strong></div>
                <div><span>Outras deduções</span><strong>- {money(summary.extraDeductions)}</strong></div>
                <div className="total"><span>Recebido líquido</span><strong>{money(summary.netSales)}</strong></div>
                <div><span>Custo das peças vendidas</span><strong>- {money(summary.costOfGoodsSold)}</strong></div>
                <div className="profit"><span>Lucro das vendas</span><strong>{money(summary.salesProfit)}</strong></div>
              </div>
            </section>

            <section className="finance-card">
              <div className="finance-card-title"><span>ÚLTIMOS MESES</span><h2>Entradas x saídas</h2></div>
              {dashboard.monthly.length ? <div className="finance-month-chart">
                {dashboard.monthly.map((row) => (
                  <div className="finance-month" key={row.month}>
                    <div className="bars"><i style={{ height: `${Math.max(3, (row.inflow / maxMonthly) * 100)}%` }} /><b style={{ height: `${Math.max(3, (row.outflow / maxMonthly) * 100)}%` }} /></div>
                    <span>{row.month.slice(5)}/{row.month.slice(2,4)}</span>
                    <small>{money(row.profit)}</small>
                  </div>
                ))}
              </div> : <div className="finance-empty">As movimentações mensais aparecerão aqui.</div>}
              <div className="finance-chart-legend"><span><i /> Entradas</span><span><b /> Saídas</span></div>
            </section>
          </div>
        </>
      )}

      {tab === "history" && dashboard.legacy && (
        <section className="finance-history">
          <section className="finance-card">
            <div className="finance-card-title">
              <span>ARQUIVO ORIGINAL</span>
              <h2>{dashboard.legacy.sourceName}</h2>
              <p>Importado em {dateTime(dashboard.legacy.importedAt)}. As linhas abaixo preservam os valores do controle antigo. Registros novos continuam sendo feitos normalmente nas outras abas.</p>
            </div>
            <div className="finance-legacy-kpis large">
              <article><span>Valor inicial investido</span><b>{money(dashboard.legacy.summary.initialInvested)}</b></article>
              <article><span>Valor reinvestido</span><b>{money(dashboard.legacy.summary.reinvested)}</b></article>
              <article><span>Total investido</span><b>{money(dashboard.legacy.summary.totalInvested)}</b></article>
              <article><span>Renda bruta prevista</span><b>{money(dashboard.legacy.summary.projectedGross)}</b></article>
              <article><span>Lucro previsto</span><b>{money(dashboard.legacy.summary.projectedProfit)}</b></article>
              <article><span>Lucro das vendas registradas</span><b>{money(dashboard.legacy.summary.historicalSalesProfit)}</b></article>
              <article><span>% recebido</span><b>{numberValue(dashboard.legacy.summary.receivedPercent)}%</b></article>
              <article><span>Lucro % da planilha</span><b>{numberValue(dashboard.legacy.summary.profitPercent)}%</b></article>
              <article><span>Dízimo indicado em Gastos</span><b>{money(dashboard.legacy.summary.historicalTitheExpenseSummary)}</b></article>
            </div>
          </section>

          <details className="finance-history-section" open>
            <summary>Estoque / compras <small>{dashboard.legacy.stock.length} registros</small></summary>
            <div className="finance-history-table-wrap">
              <table className="finance-history-table">
                <thead><tr><th>Nº</th><th>Data</th><th>Produto</th><th>Qtd.</th><th>Custo un.</th><th>Custo total</th><th>Preço venda</th><th>Lucro/peça</th><th>Renda bruta</th><th>Lucro</th></tr></thead>
                <tbody>{dashboard.legacy.stock.map((row: any) => (
                  <tr key={row.id}><td>{row.itemNo || "—"}</td><td>{dateShort(row.purchaseDate)}</td><td>{row.productName}</td><td>{numberValue(row.quantity)}</td><td>{row.unitCost == null ? "—" : money(row.unitCost)}</td><td>{row.totalCost == null ? "—" : money(row.totalCost)}</td><td>{row.salePrice == null ? "—" : money(row.salePrice)}</td><td>{row.profitPerPiece == null ? "—" : money(row.profitPerPiece)}</td><td>{row.grossRevenue == null ? "—" : money(row.grossRevenue)}</td><td>{row.netProfit == null ? "—" : money(row.netProfit)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          <details className="finance-history-section">
            <summary>Vendas / clientes <small>{dashboard.legacy.customerSales.length} linhas originais</small></summary>
            <div className="finance-note">Mantive exatamente as colunas da planilha. Em algumas linhas antigas você usou os campos de formas diferentes, então não inverti cliente/produto nem transformei anotações como “falta 35” ou “45 - 75” em valores sem sua confirmação.</div>
            <div className="finance-history-table-wrap">
              <table className="finance-history-table">
                <thead><tr><th>Nº</th><th>Cliente</th><th>Produto</th><th>Valor / registro</th><th>Observação / data</th><th>Data detectada</th></tr></thead>
                <tbody>{dashboard.legacy.customerSales.map((row: any) => (
                  <tr key={row.id}><td>{row.sequenceNo || "—"}</td><td>{row.clientRaw || "—"}</td><td>{row.productRaw || "—"}</td><td>{row.valueRaw || "—"}</td><td>{row.obsRaw || "—"}</td><td>{row.detectedDate ? dateShort(row.detectedDate) : "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          <details className="finance-history-section">
            <summary>Resumo de produtos vendidos <small>{dashboard.legacy.productSales.length} produtos</small></summary>
            <div className="finance-history-table-wrap">
              <table className="finance-history-table">
                <thead><tr><th>Produto</th><th>Qtd. vendida</th><th>Recebido</th><th>Lucro</th><th>10%</th></tr></thead>
                <tbody>{dashboard.legacy.productSales.map((row: any) => (
                  <tr key={row.id}><td>{row.productName}</td><td>{numberValue(row.qtySold)}</td><td>{row.received == null ? "—" : money(row.received)}</td><td>{row.profit == null ? "—" : money(row.profit)}</td><td>{row.contribution10Percent == null ? "—" : money(row.contribution10Percent)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          <details className="finance-history-section">
            <summary>Gastos <small>{dashboard.legacy.expenses.length} registros</small></summary>
            <div className="finance-history-table-wrap">
              <table className="finance-history-table">
                <thead><tr><th>Nº</th><th>Descrição</th><th>Valor</th></tr></thead>
                <tbody>{dashboard.legacy.expenses.map((row: any) => (
                  <tr key={row.id}><td>{row.sequenceNo || "—"}</td><td>{row.description}</td><td>{row.amount == null ? "—" : money(row.amount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          <details className="finance-history-section">
            <summary>Posição das peças <small>{dashboard.legacy.stockPositions.length} produtos</small></summary>
            <div className="finance-history-table-wrap">
              <table className="finance-history-table">
                <thead><tr><th>Nº</th><th>Produto</th><th>Qtd. total</th><th>Qtd. total vendida</th><th>Minha disponível</th></tr></thead>
                <tbody>{dashboard.legacy.stockPositions.map((row: any) => (
                  <tr key={row.id}><td>{row.sequenceNo || "—"}</td><td>{row.productName}</td><td>{numberValue(row.qtyTotal)}</td><td>{numberValue(row.qtySold)}</td><td>{numberValue(row.qtyAvailable)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {tab === "sales" && (
        <section className="finance-card">
          <div className="finance-card-title"><span>VENDAS AUTOMÁTICAS</span><h2>Vendas da sua vez</h2><p>O sistema registra a venda sozinho. Aqui você pode corrigir o bruto, custo, desconto, taxas ou até informar exatamente quanto recebeu.</p></div>
          <div className="finance-sales-list">
            {dashboard.sales.length ? dashboard.sales.map((sale) => (
              <article className={`finance-sale ${sale.status}`} key={sale.id}>
                <div className="finance-sale-main">
                  <div className="finance-sale-image"><Image src={sale.imageUrl || "/products/body-vinho.svg"} alt={sale.productName} width={100} height={125} /></div>
                  <div className="finance-sale-info">
                    <span>{sale.lotCode} · {dateTime(sale.soldAt)}</span>
                    <h3>{sale.productName}</h3>
                    <small>{sale.size}{sale.color ? ` · ${sale.color}` : ""} · {sale.sourceType === "online_order" ? "Venda online" : "Venda presencial"}</small>
                    {sale.productActive && sale.productSlug && <Link href={`/produto/${sale.productSlug}`} target="_blank">Ver roupa na loja ↗</Link>}
                  </div>
                  <div className="finance-sale-values"><span>Bruto <b>{money(sale.grossAmount)}</b></span><span>Líquido <b>{money(sale.netReceived)}</b></span><span>Lucro <b className={sale.profit < 0 ? "negative" : ""}>{money(sale.profit)}</b></span></div>
                  <button type="button" onClick={() => editingSaleId === sale.id ? setEditingSaleId("") : editSale(sale)} disabled={sale.status === "reversed"}>{editingSaleId === sale.id ? "Fechar" : "Editar cálculo"}</button>
                </div>
                {sale.status === "reversed" && <div className="finance-sale-reversed">Venda estornada/cancelada — não entra nos totais.</div>}
                {editingSaleId === sale.id && saleForm && (
                  <div className="finance-sale-editor">
                    <label>Valor bruto manual (opcional)<input inputMode="decimal" value={saleForm.grossAmountOverride} onChange={(e) => setSaleForm({ ...saleForm, grossAmountOverride: e.target.value })} placeholder={`Automático: ${money(sale.automaticGrossAmount)}`} /></label>
                    <RuleEditor title="Desconto" mode={saleForm.discountMode} value={saleForm.discountValue} onMode={(value) => setSaleForm({ ...saleForm, discountMode: value })} onValue={(value) => setSaleForm({ ...saleForm, discountValue: value })} />
                    <RuleEditor title="Taxa do pagamento/cartão" mode={saleForm.paymentFeeMode} value={saleForm.paymentFeeValue} onMode={(value) => setSaleForm({ ...saleForm, paymentFeeMode: value })} onValue={(value) => setSaleForm({ ...saleForm, paymentFeeValue: value })} />
                    <RuleEditor title="Taxa/parte da loja" mode={saleForm.storeFeeMode} value={saleForm.storeFeeValue} onMode={(value) => setSaleForm({ ...saleForm, storeFeeMode: value })} onValue={(value) => setSaleForm({ ...saleForm, storeFeeValue: value })} />
                    <RuleEditor title="Outra dedução" mode={saleForm.extraDeductionMode} value={saleForm.extraDeductionValue} onMode={(value) => setSaleForm({ ...saleForm, extraDeductionMode: value })} onValue={(value) => setSaleForm({ ...saleForm, extraDeductionValue: value })} />
                    <label>Custo desta peça<input inputMode="decimal" value={saleForm.unitCost} onChange={(e) => setSaleForm({ ...saleForm, unitCost: e.target.value })} /></label>
                    <label>Recebido líquido manual (opcional)<input inputMode="decimal" value={saleForm.netReceivedOverride} onChange={(e) => setSaleForm({ ...saleForm, netReceivedOverride: e.target.value })} placeholder="Deixe vazio para o sistema calcular" /></label>
                    <label className="wide">Observação<textarea value={saleForm.notes} onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })} /></label>
                    <div className="wide finance-editor-help">O valor automático original sempre fica preservado. Preencher “recebido líquido manual” substitui o cálculo final apenas nesta venda.</div>
                    <button className="finance-save wide" type="button" disabled={saving} onClick={() => void saveSale()}>{saving ? "Salvando..." : "Salvar e recalcular"}</button>
                  </div>
                )}
              </article>
            )) : <div className="finance-empty">Ainda não existem vendas atribuídas a você.</div>}
          </div>
        </section>
      )}

      {tab === "moves" && (
        <div className="finance-grid-two finance-moves-grid">
          <section className="finance-card">
            <div className="finance-card-title"><span>LANÇAMENTO MANUAL</span><h2>{transactionForm.transactionId ? "Editar movimentação" : "Nova movimentação"}</h2><p>Use para gastos, entradas extras, compras de mercadoria ou retiradas pessoais.</p></div>
            <div className="finance-form-grid">
              <label>Tipo<select value={transactionForm.kind} onChange={(e) => setTransactionForm({ ...transactionForm, kind: e.target.value as TransactionKind })}><option value="income">Entrada</option><option value="expense">Despesa</option><option value="investment">Investimento/compra de estoque</option><option value="withdrawal">Retirada</option></select></label>
              <label>Data<input type="date" value={transactionForm.occurredOn} onChange={(e) => setTransactionForm({ ...transactionForm, occurredOn: e.target.value })} /></label>
              <label>Categoria<input value={transactionForm.category} onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })} placeholder="Ex.: Frete, embalagem, divulgação" /></label>
              <label>Valor (R$)<input inputMode="decimal" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} /></label>
              <label className="wide">Descrição<input value={transactionForm.description} onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })} placeholder="Ex.: Frete do lote de vestidos" /></label>
              <label>Forma de pagamento<input value={transactionForm.paymentMethod} onChange={(e) => setTransactionForm({ ...transactionForm, paymentMethod: e.target.value })} placeholder="Pix, dinheiro, cartão..." /></label>
              <label>Lote (opcional)<select value={transactionForm.lotId} onChange={(e) => setTransactionForm({ ...transactionForm, lotId: e.target.value })}><option value="">Sem lote específico</option>{dashboard.lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.code} — {lot.name}</option>)}</select></label>
              <label className="wide">Observação<textarea value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} /></label>
              <div className="wide finance-form-actions"><button className="finance-save" type="button" disabled={saving} onClick={() => void saveTransaction()}>{saving ? "Salvando..." : transactionForm.transactionId ? "Salvar alteração" : "Adicionar ao caixa"}</button>{transactionForm.transactionId && <button type="button" onClick={() => setTransactionForm(emptyTransaction())}>Cancelar edição</button>}</div>
            </div>
          </section>

          <section className="finance-card">
            <div className="finance-card-title"><span>HISTÓRICO MANUAL</span><h2>Entradas e saídas</h2></div>
            <div className="finance-transaction-list">
              {dashboard.transactions.length ? dashboard.transactions.map((item) => (
                <article key={item.id} className={item.kind}>
                  <div><span>{item.occurredOn.split("-").reverse().join("/")} · {transactionLabel(item.kind)}</span><strong>{item.description}</strong><small>{item.category}{item.paymentMethod ? ` · ${item.paymentMethod}` : ""}</small></div>
                  <b>{item.kind === "income" ? "+" : "-"} {money(item.amount)}</b>
                  <div className="finance-row-actions"><button onClick={() => editTransaction(item)}>Editar</button><button onClick={() => void removeTransaction(item.id)}>Excluir</button></div>
                </article>
              )) : <div className="finance-empty">Nenhuma movimentação manual cadastrada.</div>}
            </div>
          </section>
        </div>
      )}

      {tab === "products" && (
        <section className="finance-card">
          <div className="finance-card-title"><span>ESTOQUE / CUSTO</span><h2>Custos das roupas dos seus lotes</h2><p>Informe uma vez o custo unitário. As próximas vendas dessa roupa já puxam o custo automaticamente. Você pode aplicar o novo custo também às vendas antigas.</p></div>
          <div className="finance-products-grid">
            {dashboard.products.length ? dashboard.products.map((item) => {
              const key = `${item.lotId}|||${item.variantId}`;
              const draft = costDrafts[key] || { unitCost: "0", plannedPrice: "", notes: "", applyExisting: false };
              return <article className="finance-product" key={key}>
                <div className="finance-product-photo"><Image src={item.imageUrl || "/products/body-vinho.svg"} alt={item.productName} width={260} height={325} /></div>
                <div className="finance-product-body">
                  <span>{item.lotName}</span><h3>{item.productName}</h3><small>{item.size}{item.color ? ` · ${item.color}` : ""} · {item.quantityInLot} no lote</small>
                  {item.productActive && item.productSlug && <Link href={`/produto/${item.productSlug}`} target="_blank">Abrir produto ↗</Link>}
                  <label>Custo unitário (R$)<input inputMode="decimal" value={draft.unitCost} onChange={(e) => setCostDrafts({ ...costDrafts, [key]: { ...draft, unitCost: e.target.value } })} /></label>
                  <label>Preço planejado (opcional)<input inputMode="decimal" value={draft.plannedPrice} onChange={(e) => setCostDrafts({ ...costDrafts, [key]: { ...draft, plannedPrice: e.target.value } })} /></label>
                  <label>Observação<input value={draft.notes} onChange={(e) => setCostDrafts({ ...costDrafts, [key]: { ...draft, notes: e.target.value } })} /></label>
                  <label className="finance-check"><input type="checkbox" checked={Boolean(draft.applyExisting)} onChange={(e) => setCostDrafts({ ...costDrafts, [key]: { ...draft, applyExisting: e.target.checked } })} /> Aplicar este custo também às vendas anteriores</label>
                  <button className="finance-save" type="button" disabled={saving} onClick={() => void saveCost(item)}>Salvar custo</button>
                </div>
              </article>;
            }) : <div className="finance-empty">As roupas dos seus lotes aparecerão aqui.</div>}
          </div>
        </section>
      )}

      {tab === "rules" && settingsForm && (
        <section className="finance-card">
          <div className="finance-card-title"><span>AUTOMAÇÃO</span><h2>Regras padrão das próximas vendas</h2><p>Deixe tudo em zero para receber o valor integral. Você pode usar percentual ou valor fixo. Mesmo com regras automáticas, cada venda continua editável individualmente.</p></div>
          <div className="finance-rules-grid">
            <label>Saldo inicial do caixa (R$)<input inputMode="decimal" value={settingsForm.openingBalance} onChange={(e) => setSettingsForm({ ...settingsForm, openingBalance: e.target.value })} /></label>
            <label>Percentual para reinvestir (%)<input inputMode="decimal" value={settingsForm.reinvestmentPercent} onChange={(e) => setSettingsForm({ ...settingsForm, reinvestmentPercent: e.target.value })} /></label>
            <RuleEditor title="Desconto padrão" mode={settingsForm.defaultDiscountMode} value={settingsForm.defaultDiscountValue} onMode={(value) => setSettingsForm({ ...settingsForm, defaultDiscountMode: value })} onValue={(value) => setSettingsForm({ ...settingsForm, defaultDiscountValue: value })} />
            <RuleEditor title="Taxa padrão do pagamento/cartão" mode={settingsForm.defaultPaymentFeeMode} value={settingsForm.defaultPaymentFeeValue} onMode={(value) => setSettingsForm({ ...settingsForm, defaultPaymentFeeMode: value })} onValue={(value) => setSettingsForm({ ...settingsForm, defaultPaymentFeeValue: value })} />
            <RuleEditor title="Taxa/parte padrão da loja" mode={settingsForm.defaultStoreFeeMode} value={settingsForm.defaultStoreFeeValue} onMode={(value) => setSettingsForm({ ...settingsForm, defaultStoreFeeMode: value })} onValue={(value) => setSettingsForm({ ...settingsForm, defaultStoreFeeValue: value })} />
            <RuleEditor title="Outra dedução padrão" mode={settingsForm.defaultExtraDeductionMode} value={settingsForm.defaultExtraDeductionValue} onMode={(value) => setSettingsForm({ ...settingsForm, defaultExtraDeductionMode: value })} onValue={(value) => setSettingsForm({ ...settingsForm, defaultExtraDeductionValue: value })} />
          </div>
          <div className="finance-note"><strong>Como funciona:</strong> quando uma venda entra no rodízio, o sistema grava uma cópia destas regras naquela venda. Alterar as regras depois não muda as vendas antigas. Para uma exceção, abra “Vendas automáticas” e edite somente aquela venda.</div>
          <button className="finance-save" type="button" disabled={saving} onClick={() => void saveSettings()}>{saving ? "Salvando..." : "Salvar regras automáticas"}</button>
        </section>
      )}

      <FinanceStyle />
    </section>
  );
}

function FinanceStyle() {
  return <style jsx global>{`
    .finance-shell{display:grid;gap:18px}.finance-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.finance-heading>div{display:grid;gap:7px}.finance-heading>div>span,.finance-card-title>span{font-size:9px;font-weight:900;letter-spacing:.14em;color:#9a795f}.finance-heading h1{font:500 40px Georgia,serif;margin:0}.finance-heading p,.finance-card-title p{margin:0;color:#716a63;line-height:1.55;max-width:820px}.finance-heading>button{border:1px solid #d5cec5;background:#fff;padding:10px 14px}.finance-alert{padding:12px 14px;font-size:12px}.finance-alert.error,.finance-error{background:#fff0f0;color:#912626;border:1px solid #f0cccc}.finance-alert.ok{background:#eef8f0;color:#276737;border:1px solid #cfe6d5}.finance-loading,.finance-error{padding:28px;text-align:center}.finance-tabs{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px}.finance-tabs button{white-space:nowrap;border:1px solid #d9d2ca;background:#fff;padding:10px 14px;font-size:11px}.finance-tabs button.active{background:#111;color:#fff;border-color:#111}.finance-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.finance-kpis article{background:#fff;border:1px solid #dfd9d1;padding:18px;display:grid;gap:7px}.finance-kpis article.primary{background:#151515;color:#fff}.finance-kpis span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#827870}.finance-kpis .primary span,.finance-kpis .primary small{color:#bbb}.finance-kpis strong{font:600 28px Georgia,serif}.finance-kpis small{font-size:10px;color:#817971}.finance-grid-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.finance-card{background:#fff;border:1px solid #dfd9d1;padding:22px;display:grid;gap:18px}.finance-card-title{display:grid;gap:5px}.finance-card-title h2{font:500 27px Georgia,serif;margin:0}.finance-breakdown{display:grid}.finance-breakdown>div{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #eee8e1;padding:10px 0;font-size:12px}.finance-breakdown .total{border-top:2px solid #222;font-weight:800}.finance-breakdown .profit{background:#f3f0eb;padding:12px}.finance-month-chart{height:210px;display:flex;align-items:stretch;gap:8px;padding-top:12px}.finance-month{min-width:38px;flex:1;display:grid;grid-template-rows:1fr auto auto;gap:4px;text-align:center}.finance-month .bars{height:150px;display:flex;align-items:flex-end;justify-content:center;gap:3px;border-bottom:1px solid #ddd}.finance-month .bars i,.finance-month .bars b{display:block;width:10px;min-height:3px}.finance-month .bars i{background:#171717}.finance-month .bars b{background:#b9997f}.finance-month span{font-size:9px}.finance-month small{font-size:8px;color:#777}.finance-chart-legend{display:flex;gap:15px;font-size:9px;color:#777}.finance-chart-legend span{display:flex;gap:5px;align-items:center}.finance-chart-legend i,.finance-chart-legend b{display:block;width:10px;height:10px}.finance-chart-legend i{background:#171717}.finance-chart-legend b{background:#b9997f}.finance-empty{padding:24px;text-align:center;background:#f8f5f1;border:1px dashed #d8cec3;color:#756b62}.finance-sales-list{display:grid;gap:9px}.finance-sale{border:1px solid #e2dcd5}.finance-sale.reversed{opacity:.65}.finance-sale-main{display:grid;grid-template-columns:72px minmax(200px,1fr) minmax(250px,auto) auto;gap:14px;align-items:center;padding:12px}.finance-sale-image{width:72px;height:90px;overflow:hidden;background:#eee}.finance-sale-image img{width:100%;height:100%;object-fit:cover}.finance-sale-info{display:grid;gap:4px}.finance-sale-info>span{font-size:9px;color:#8d7968}.finance-sale-info h3{font:600 19px Georgia,serif;margin:0}.finance-sale-info small{color:#777}.finance-sale-info a{font-size:10px;color:#111}.finance-sale-values{display:flex;gap:14px;flex-wrap:wrap}.finance-sale-values span{display:grid;gap:3px;font-size:9px;color:#777}.finance-sale-values b{font-size:13px;color:#111}.finance-sale-values b.negative{color:#a52b2b}.finance-sale-main>button,.finance-row-actions button{border:1px solid #d7cfc6;background:#fff;padding:8px 10px;font-size:10px}.finance-sale-reversed{padding:9px 12px;background:#f6eeee;color:#8b4a4a;font-size:10px}.finance-sale-editor{background:#faf8f5;border-top:1px solid #e6dfd7;padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.finance-sale-editor label,.finance-form-grid label,.finance-rules-grid>label,.finance-rule-field,.finance-product-body label{display:grid;gap:6px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#645c56}.finance-sale-editor input,.finance-sale-editor textarea,.finance-form-grid input,.finance-form-grid select,.finance-form-grid textarea,.finance-rules-grid input,.finance-rule-field input,.finance-rule-field select,.finance-product-body input{width:100%;box-sizing:border-box;border:1px solid #d8d1c9;background:#fff;padding:10px;font:12px Arial;text-transform:none;letter-spacing:0;color:#111}.finance-rule-field>div{display:grid;grid-template-columns:1.4fr 1fr;gap:6px}.finance-sale-editor .wide,.finance-form-grid .wide{grid-column:1/-1}.finance-sale-editor textarea,.finance-form-grid textarea{min-height:72px;resize:vertical}.finance-editor-help,.finance-note{background:#f1ece6;padding:11px;font-size:10px;color:#665e57;line-height:1.5}.finance-save{border:0;background:#111;color:#fff;padding:11px 14px;font-weight:800;font-size:11px}.finance-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.finance-form-actions{display:flex;gap:8px}.finance-form-actions>button:not(.finance-save){border:1px solid #d6cec5;background:#fff;padding:10px 13px}.finance-transaction-list{display:grid;gap:7px;max-height:610px;overflow:auto}.finance-transaction-list article{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;border-bottom:1px solid #eee8e1;padding:11px 0}.finance-transaction-list article>div:first-child{display:grid;gap:3px}.finance-transaction-list article span{font-size:8px;text-transform:uppercase;color:#8b7a6c}.finance-transaction-list article small{font-size:9px;color:#777}.finance-transaction-list article>b{font-size:12px}.finance-transaction-list article.income>b{color:#28703a}.finance-transaction-list article.expense>b,.finance-transaction-list article.investment>b,.finance-transaction-list article.withdrawal>b{color:#9a3838}.finance-row-actions{display:flex;gap:4px}.finance-products-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}.finance-product{border:1px solid #e1dad1;background:#faf8f5;overflow:hidden}.finance-product-photo{aspect-ratio:4/3;background:#eee;overflow:hidden}.finance-product-photo img{width:100%;height:100%;object-fit:cover}.finance-product-body{padding:14px;display:grid;gap:9px}.finance-product-body>span{font-size:8px;color:#987b64;text-transform:uppercase;font-weight:800}.finance-product-body h3{font:600 20px Georgia,serif;margin:0}.finance-product-body small{color:#777}.finance-product-body a{font-size:10px;color:#111}.finance-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;text-transform:none!important;letter-spacing:0!important;font-weight:500!important}.finance-check input{width:auto!important}.finance-rules-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.finance-rules-grid>.finance-rule-field{border:1px solid #eee6de;padding:12px}.finance-note{max-width:900px}.finance-legacy-summary{background:#f4efe8;border:1px solid #d8c8b9;padding:20px;display:grid;gap:16px}.finance-legacy-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.finance-legacy-kpis.large{grid-template-columns:repeat(3,1fr)}.finance-legacy-kpis article{background:#fff;border:1px solid #e0d7cf;padding:13px;display:grid;gap:5px}.finance-legacy-kpis span{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#806f62}.finance-legacy-kpis b{font:600 18px Georgia,serif}.finance-history{display:grid;gap:12px}.finance-history-section{background:#fff;border:1px solid #dfd9d1}.finance-history-section>summary{cursor:pointer;padding:15px 17px;font-weight:800;font-size:12px;display:flex;justify-content:space-between;gap:12px}.finance-history-section>summary small{color:#8d8177;font-weight:500}.finance-history-section>.finance-note{margin:0 14px 12px}.finance-history-table-wrap{overflow:auto;border-top:1px solid #eee8e1;max-height:560px}.finance-history-table{width:100%;border-collapse:collapse;min-width:850px;font-size:10px}.finance-history-table th{position:sticky;top:0;background:#171717;color:#fff;text-align:left;padding:9px;z-index:1}.finance-history-table td{padding:8px 9px;border-bottom:1px solid #eee8e1;vertical-align:top}.finance-history-table tbody tr:nth-child(even){background:#faf8f5}@media(max-width:900px){.finance-kpis{grid-template-columns:1fr 1fr}.finance-legacy-kpis,.finance-legacy-kpis.large{grid-template-columns:1fr 1fr}.finance-grid-two{grid-template-columns:1fr}.finance-sale-main{grid-template-columns:65px 1fr}.finance-sale-values{grid-column:1/-1}.finance-sale-main>button{grid-column:1/-1}.finance-sale-editor{grid-template-columns:1fr 1fr}.finance-rules-grid{grid-template-columns:1fr}.finance-moves-grid{grid-template-columns:1fr}}@media(max-width:560px){.finance-kpis{grid-template-columns:1fr}.finance-legacy-kpis,.finance-legacy-kpis.large{grid-template-columns:1fr}.finance-heading{align-items:flex-start;flex-direction:column}.finance-heading h1{font-size:34px}.finance-sale-editor,.finance-form-grid{grid-template-columns:1fr}.finance-sale-editor .wide,.finance-form-grid .wide{grid-column:auto}.finance-transaction-list article{grid-template-columns:1fr auto}.finance-row-actions{grid-column:1/-1}.finance-month-chart{overflow-x:auto}.finance-month{min-width:50px}}
  `}</style>;
}
