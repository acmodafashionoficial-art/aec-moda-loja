import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getInvestorPortalDashboard, requireInvestorRequest } from "@/lib/investor-portal";

export type FinancialRuleMode = "none" | "percent" | "fixed";
export type CashTransactionKind = "income" | "expense" | "investment" | "withdrawal";

export type InvestorFinancialSettings = {
  openingBalance: number;
  defaultDiscountMode: FinancialRuleMode;
  defaultDiscountValue: number;
  defaultPaymentFeeMode: FinancialRuleMode;
  defaultPaymentFeeValue: number;
  defaultStoreFeeMode: FinancialRuleMode;
  defaultStoreFeeValue: number;
  defaultExtraDeductionMode: FinancialRuleMode;
  defaultExtraDeductionValue: number;
  reinvestmentPercent: number;
};

const DEFAULT_SETTINGS: InvestorFinancialSettings = {
  openingBalance: 0,
  defaultDiscountMode: "none",
  defaultDiscountValue: 0,
  defaultPaymentFeeMode: "none",
  defaultPaymentFeeValue: 0,
  defaultStoreFeeMode: "none",
  defaultStoreFeeValue: 0,
  defaultExtraDeductionMode: "none",
  defaultExtraDeductionValue: 0,
  reinvestmentPercent: 0,
};

function adminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado para o caixa do investidor.");
  return supabase;
}

function amount(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 100) / 100;
}

function nonNegative(value: unknown, max = 999_999_999) {
  return Math.min(max, Math.max(0, amount(value)));
}

function nullableMoney(value: unknown) {
  if (value == null || value === "") return null;
  return nonNegative(value);
}

function ruleMode(value: unknown): FinancialRuleMode {
  return value === "percent" || value === "fixed" ? value : "none";
}

function ruleValue(mode: FinancialRuleMode, value: unknown) {
  if (mode === "none") return 0;
  return nonNegative(value, mode === "percent" ? 100 : 999_999_999);
}

function text(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function dateOnly(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Informe uma data válida.");
  const parsed = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Informe uma data válida.");
  return raw;
}

function mapSettings(row: any | null): InvestorFinancialSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    openingBalance: amount(row.opening_balance),
    defaultDiscountMode: ruleMode(row.default_discount_mode),
    defaultDiscountValue: nonNegative(row.default_discount_value),
    defaultPaymentFeeMode: ruleMode(row.default_payment_fee_mode),
    defaultPaymentFeeValue: nonNegative(row.default_payment_fee_value),
    defaultStoreFeeMode: ruleMode(row.default_store_fee_mode),
    defaultStoreFeeValue: nonNegative(row.default_store_fee_value),
    defaultExtraDeductionMode: ruleMode(row.default_extra_deduction_mode),
    defaultExtraDeductionValue: nonNegative(row.default_extra_deduction_value),
    reinvestmentPercent: nonNegative(row.reinvestment_percent, 100),
  };
}

async function audit(input: {
  investorId: string;
  authUserId?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = adminClient();
  await supabase.from("investor_financial_audit").insert({
    investor_id: input.investorId,
    auth_user_id: input.authUserId || null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    metadata: input.metadata || {},
  });
}

function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function legacyAmount(summary: any, key: string) {
  return amount(summary && typeof summary === "object" ? summary[key] : 0);
}

function legacyCount(summary: any, key: string) {
  return Math.max(0, Math.floor(Number(summary && typeof summary === "object" ? summary[key] : 0) || 0));
}

export async function getInvestorFinanceDashboard(request: Request) {
  const portal = await getInvestorPortalDashboard(request);
  const supabase = adminClient();
  const investorId = String(portal.investor.id);

  const [settingsResult, salesResult, transactionsResult, costsResult] = await Promise.all([
    supabase.from("investor_financial_settings").select("*").eq("investor_id", investorId).maybeSingle(),
    supabase.from("investor_financial_sales_live").select("*").eq("investor_id", investorId).order("sold_at", { ascending: false }).limit(2000),
    supabase.from("investor_cash_transactions").select("*").eq("investor_id", investorId).eq("status", "active").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    supabase.from("investor_financial_product_costs").select("*").eq("investor_id", investorId).limit(10000),
  ]);

  if (settingsResult.error) throw new Error(`Erro ao carregar regras do caixa: ${settingsResult.error.message}`);
  if (salesResult.error) throw new Error(`Erro ao carregar vendas do caixa: ${salesResult.error.message}`);
  if (transactionsResult.error) throw new Error(`Erro ao carregar movimentações: ${transactionsResult.error.message}`);
  if (costsResult.error) throw new Error(`Erro ao carregar custos das roupas: ${costsResult.error.message}`);

  const { data: legacyImportRow, error: legacyImportError } = await supabase
    .from("investor_financial_legacy_imports")
    .select("*")
    .eq("investor_id", investorId)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A Etapa 8 é opcional. Se a tabela ainda não existir, o caixa da Etapa 7 continua funcionando.
  const legacyTableMissing = legacyImportError && /does not exist|schema cache/i.test(legacyImportError.message || "");
  if (legacyImportError && !legacyTableMissing) {
    throw new Error(`Erro ao carregar histórico da planilha: ${legacyImportError.message}`);
  }

  let legacy: any = null;
  if (legacyImportRow) {
    const importId = String(legacyImportRow.id);
    const [stockLegacy, customerSalesLegacy, productSalesLegacy, expensesLegacy, positionsLegacy] = await Promise.all([
      supabase.from("investor_financial_legacy_stock").select("*").eq("import_id", importId).order("source_row"),
      supabase.from("investor_financial_legacy_customer_sales").select("*").eq("import_id", importId).order("source_row"),
      supabase.from("investor_financial_legacy_product_sales").select("*").eq("import_id", importId).order("source_row"),
      supabase.from("investor_financial_legacy_expenses").select("*").eq("import_id", importId).order("source_row"),
      supabase.from("investor_financial_legacy_stock_positions").select("*").eq("import_id", importId).order("source_row"),
    ]);
    for (const result of [stockLegacy, customerSalesLegacy, productSalesLegacy, expensesLegacy, positionsLegacy]) {
      if (result.error) throw new Error(`Erro ao carregar linhas importadas: ${result.error.message}`);
    }

    const rawSummary: any = legacyImportRow.summary || {};
    legacy = {
      id: importId,
      sourceName: String(legacyImportRow.source_name || "Planilha antiga"),
      importedAt: String(legacyImportRow.imported_at),
      cutoverAt: String(legacyImportRow.cutover_at || legacyImportRow.imported_at),
      notes: legacyImportRow.notes ? String(legacyImportRow.notes) : "",
      summary: {
        piecesPurchased: legacyCount(rawSummary, "pieces_purchased"),
        piecesSold: legacyCount(rawSummary, "pieces_sold"),
        piecesAvailable: legacyCount(rawSummary, "pieces_available"),
        initialInvested: legacyAmount(rawSummary, "initial_invested"),
        reinvested: legacyAmount(rawSummary, "reinvested"),
        totalInvested: legacyAmount(rawSummary, "total_invested"),
        projectedGross: legacyAmount(rawSummary, "projected_gross"),
        projectedProfit: legacyAmount(rawSummary, "projected_profit"),
        receivedPercent: legacyAmount(rawSummary, "received_percent"),
        profitPercent: legacyAmount(rawSummary, "profit_percent"),
        historicalInflow: legacyAmount(rawSummary, "historical_inflow"),
        historicalOutflow: legacyAmount(rawSummary, "historical_outflow"),
        cashBalance: legacyAmount(rawSummary, "cash_balance"),
        historicalSalesProfit: legacyAmount(rawSummary, "historical_sales_profit"),
        historicalContributionProductSummary: legacyAmount(rawSummary, "historical_contribution_product_summary"),
        historicalTitheExpenseSummary: legacyAmount(rawSummary, "historical_tithe_expense_summary"),
        unpaidMarker: legacyAmount(rawSummary, "unpaid_marker"),
        cashFormulaDifference: legacyAmount(rawSummary, "cash_formula_difference"),
      },
      stock: ((stockLegacy.data || []) as any[]).map((row) => ({
        id: String(row.id),
        sourceRow: Number(row.source_row) || 0,
        itemNo: row.item_no ? String(row.item_no) : "",
        productName: String(row.product_name || ""),
        purchaseDate: row.purchase_date ? String(row.purchase_date) : "",
        quantity: row.quantity == null ? null : amount(row.quantity),
        unitCost: row.unit_cost == null ? null : amount(row.unit_cost),
        totalCost: row.total_cost == null ? null : amount(row.total_cost),
        salePrice: row.sale_price == null ? null : amount(row.sale_price),
        profitPerPiece: row.profit_per_piece == null ? null : amount(row.profit_per_piece),
        salePricePercent: row.sale_price_percent == null ? null : amount(row.sale_price_percent),
        grossRevenue: row.gross_revenue == null ? null : amount(row.gross_revenue),
        netProfit: row.net_profit == null ? null : amount(row.net_profit),
        profitPercent: row.profit_percent == null ? null : amount(row.profit_percent),
      })),
      customerSales: ((customerSalesLegacy.data || []) as any[]).map((row) => ({
        id: String(row.id),
        sourceRow: Number(row.source_row) || 0,
        sequenceNo: row.sequence_no ? String(row.sequence_no) : "",
        clientRaw: row.client_raw ? String(row.client_raw) : "",
        productRaw: row.product_raw ? String(row.product_raw) : "",
        valueRaw: row.value_raw ? String(row.value_raw) : "",
        obsRaw: row.obs_raw ? String(row.obs_raw) : "",
        amountNumeric: row.amount_numeric == null ? null : amount(row.amount_numeric),
        detectedDate: row.detected_date ? String(row.detected_date) : "",
        statusRaw: row.status_raw ? String(row.status_raw) : "",
      })),
      productSales: ((productSalesLegacy.data || []) as any[]).map((row) => ({
        id: String(row.id),
        sourceRow: Number(row.source_row) || 0,
        productName: String(row.product_name || ""),
        qtySold: row.qty_sold == null ? null : amount(row.qty_sold),
        received: row.received == null ? null : amount(row.received),
        profit: row.profit == null ? null : amount(row.profit),
        contribution10Percent: row.contribution_10pct == null ? null : amount(row.contribution_10pct),
      })),
      expenses: ((expensesLegacy.data || []) as any[]).map((row) => ({
        id: String(row.id),
        sourceRow: Number(row.source_row) || 0,
        sequenceNo: row.sequence_no ? String(row.sequence_no) : "",
        description: String(row.description || ""),
        amount: row.amount == null ? null : amount(row.amount),
      })),
      stockPositions: ((positionsLegacy.data || []) as any[]).map((row) => ({
        id: String(row.id),
        sourceRow: Number(row.source_row) || 0,
        sequenceNo: row.sequence_no ? String(row.sequence_no) : "",
        productName: String(row.product_name || ""),
        qtyTotal: row.qty_total == null ? null : amount(row.qty_total),
        qtySold: row.qty_sold == null ? null : amount(row.qty_sold),
        qtyAvailable: row.qty_available == null ? null : amount(row.qty_available),
      })),
    };
  }

  const settings = mapSettings(settingsResult.data);
  const sales = ((salesResult.data || []) as any[]).map((row) => ({
    id: String(row.id),
    allocationId: String(row.allocation_id),
    lotId: String(row.lot_id),
    lotCode: String(row.lot_code || ""),
    lotName: String(row.lot_name || "Lote"),
    variantId: String(row.variant_id),
    productId: String(row.product_id),
    productName: String(row.product_name || "Produto"),
    productSlug: String(row.product_slug || ""),
    productActive: row.product_active !== false,
    imageUrl: row.image_url ? String(row.image_url) : null,
    sku: String(row.sku || ""),
    size: String(row.size || ""),
    color: String(row.color || ""),
    sourceType: row.source_type === "online_order" ? "online_order" : "store_sale",
    automaticGrossAmount: amount(row.automatic_gross_amount),
    grossAmount: amount(row.gross_amount),
    grossAmountOverride: row.gross_amount_override == null ? null : amount(row.gross_amount_override),
    status: row.sale_status === "reversed" ? "reversed" : "active",
    soldAt: String(row.sold_at),
    discountMode: ruleMode(row.discount_mode),
    discountValue: nonNegative(row.discount_value),
    discountAmount: nonNegative(row.discount_amount),
    paymentFeeMode: ruleMode(row.payment_fee_mode),
    paymentFeeValue: nonNegative(row.payment_fee_value),
    paymentFeeAmount: nonNegative(row.payment_fee_amount),
    storeFeeMode: ruleMode(row.store_fee_mode),
    storeFeeValue: nonNegative(row.store_fee_value),
    storeFeeAmount: nonNegative(row.store_fee_amount),
    extraDeductionMode: ruleMode(row.extra_deduction_mode),
    extraDeductionValue: nonNegative(row.extra_deduction_value),
    extraDeductionAmount: nonNegative(row.extra_deduction_amount),
    unitCost: nonNegative(row.unit_cost),
    netReceivedOverride: row.net_received_override == null ? null : amount(row.net_received_override),
    netReceived: nonNegative(row.net_received),
    profit: amount(row.profit),
    profitPercent: row.profit_percent == null ? null : amount(row.profit_percent),
    notes: row.notes ? String(row.notes) : "",
  }));

  const transactions = ((transactionsResult.data || []) as any[]).map((row) => ({
    id: String(row.id),
    lotId: row.lot_id ? String(row.lot_id) : null,
    variantId: row.variant_id ? String(row.variant_id) : null,
    kind: row.kind as CashTransactionKind,
    category: String(row.category || "Outros"),
    description: String(row.description || ""),
    amount: nonNegative(row.amount),
    occurredOn: String(row.occurred_on),
    paymentMethod: row.payment_method ? String(row.payment_method) : "",
    notes: row.notes ? String(row.notes) : "",
    createdAt: String(row.created_at),
  }));

  const costs = new Map(
    ((costsResult.data || []) as any[]).map((row) => [
      `${row.lot_id}|||${row.variant_id}`,
      {
        id: String(row.id),
        unitCost: nonNegative(row.unit_cost),
        plannedPrice: row.planned_price == null ? null : nonNegative(row.planned_price),
        notes: row.notes ? String(row.notes) : "",
      },
    ]),
  );

  const lotNameById = new Map((portal.lots || []).map((lot: any) => [String(lot.id), String(lot.name || lot.code || "Lote")]));
  const products = (portal.items || []).map((item: any) => {
    const cost = costs.get(`${item.lot_id}|||${item.variant_id}`);
    return {
      lotId: String(item.lot_id),
      lotName: lotNameById.get(String(item.lot_id)) || "Lote",
      variantId: String(item.variant_id),
      productId: String(item.product_id),
      productName: String(item.product_name || "Produto"),
      productSlug: String(item.product_slug || ""),
      productActive: item.product_active !== false,
      imageUrl: item.image_url ? String(item.image_url) : null,
      sku: String(item.sku || ""),
      size: String(item.size || ""),
      color: String(item.color || ""),
      quantityInLot: Math.max(0, Math.floor(Number(item.quantity) || 0)),
      unitCost: cost?.unitCost || 0,
      plannedPrice: cost?.plannedPrice ?? null,
      notes: cost?.notes || "",
    };
  });

  const activeSales = sales.filter((sale) => sale.status === "active");
  const cutoverTime = legacy ? new Date(legacy.cutoverAt).getTime() : null;
  const summarySales = cutoverTime == null
    ? activeSales
    : activeSales.filter((sale) => {
        const time = new Date(sale.soldAt).getTime();
        return Number.isFinite(time) && time >= cutoverTime;
      });
  const summaryTransactions = cutoverTime == null
    ? transactions
    : transactions.filter((item) => {
        const time = new Date(item.createdAt).getTime();
        return Number.isFinite(time) && time >= cutoverTime;
      });

  const grossSales = summarySales.reduce((sum, sale) => sum + sale.grossAmount, 0);
  const discounts = summarySales.reduce((sum, sale) => sum + sale.discountAmount, 0);
  const paymentFees = summarySales.reduce((sum, sale) => sum + sale.paymentFeeAmount, 0);
  const storeFees = summarySales.reduce((sum, sale) => sum + sale.storeFeeAmount, 0);
  const extraDeductions = summarySales.reduce((sum, sale) => sum + sale.extraDeductionAmount, 0);
  const netSales = summarySales.reduce((sum, sale) => sum + sale.netReceived, 0);
  const costOfGoodsSold = summarySales.reduce((sum, sale) => sum + sale.unitCost, 0);
  const salesProfit = summarySales.reduce((sum, sale) => sum + sale.profit, 0);

  const manualIncome = summaryTransactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = summaryTransactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const newInvestments = summaryTransactions.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.amount, 0);
  const withdrawals = summaryTransactions.filter((item) => item.kind === "withdrawal").reduce((sum, item) => sum + item.amount, 0);
  const historicalProfit = legacy?.summary?.historicalSalesProfit || 0;
  const historicalCash = legacy?.summary?.cashBalance || 0;
  const historicalInvested = legacy?.summary?.totalInvested || 0;
  const profit = historicalProfit + salesProfit + manualIncome - expenses;
  const cashBalance = historicalCash + settings.openingBalance + netSales + manualIncome - expenses - newInvestments - withdrawals;
  const investments = historicalInvested + newInvestments;
  const suggestedReinvestment = Math.max(0, profit) * settings.reinvestmentPercent / 100;

  const monthlyMap = new Map<string, { month: string; inflow: number; outflow: number; profit: number }>();
  const ensureMonth = (key: string) => {
    if (!key) return null;
    const current = monthlyMap.get(key) || { month: key, inflow: 0, outflow: 0, profit: 0 };
    monthlyMap.set(key, current);
    return current;
  };
  for (const sale of summarySales) {
    const row = ensureMonth(monthKey(sale.soldAt));
    if (!row) continue;
    row.inflow += sale.netReceived;
    row.profit += sale.profit;
  }
  for (const item of summaryTransactions) {
    const row = ensureMonth(String(item.occurredOn).slice(0, 7));
    if (!row) continue;
    if (item.kind === "income") { row.inflow += item.amount; row.profit += item.amount; }
    else { row.outflow += item.amount; if (item.kind === "expense") row.profit -= item.amount; }
  }

  return {
    investor: portal.investor,
    settings,
    summary: {
      grossSales: amount(grossSales),
      discounts: amount(discounts),
      paymentFees: amount(paymentFees),
      storeFees: amount(storeFees),
      extraDeductions: amount(extraDeductions),
      netSales: amount(netSales),
      costOfGoodsSold: amount(costOfGoodsSold),
      salesProfit: amount(salesProfit),
      manualIncome: amount(manualIncome),
      expenses: amount(expenses),
      investments: amount(investments),
      withdrawals: amount(withdrawals),
      profit: amount(profit),
      cashBalance: amount(cashBalance),
      suggestedReinvestment: amount(suggestedReinvestment),
    },
    legacy,
    sales,
    transactions,
    products,
    lots: (portal.lots || []).map((lot: any) => ({ id: String(lot.id), code: String(lot.code || ""), name: String(lot.name || "Lote") })),
    monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12).map((row) => ({
      ...row,
      inflow: amount(row.inflow),
      outflow: amount(row.outflow),
      profit: amount(row.profit),
    })),
  };
}

export async function saveInvestorFinanceSettings(request: Request, raw: any) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const investorId = String(session.investor.id);

  const discountMode = ruleMode(raw.defaultDiscountMode);
  const paymentMode = ruleMode(raw.defaultPaymentFeeMode);
  const storeMode = ruleMode(raw.defaultStoreFeeMode);
  const extraMode = ruleMode(raw.defaultExtraDeductionMode);

  const row = {
    investor_id: investorId,
    opening_balance: Math.max(-999_999_999, Math.min(999_999_999, amount(raw.openingBalance))),
    default_discount_mode: discountMode,
    default_discount_value: ruleValue(discountMode, raw.defaultDiscountValue),
    default_payment_fee_mode: paymentMode,
    default_payment_fee_value: ruleValue(paymentMode, raw.defaultPaymentFeeValue),
    default_store_fee_mode: storeMode,
    default_store_fee_value: ruleValue(storeMode, raw.defaultStoreFeeValue),
    default_extra_deduction_mode: extraMode,
    default_extra_deduction_value: ruleValue(extraMode, raw.defaultExtraDeductionValue),
    reinvestment_percent: nonNegative(raw.reinvestmentPercent, 100),
  };

  const { error } = await supabase.from("investor_financial_settings").upsert(row, { onConflict: "investor_id" });
  if (error) throw new Error(`Não foi possível salvar as regras automáticas: ${error.message}`);

  await audit({
    investorId,
    authUserId: session.authUser.id,
    action: "settings.update",
    entityType: "financial_settings",
    metadata: row,
  });
  return true;
}

export async function updateInvestorFinanceSale(request: Request, raw: any) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const investorId = String(session.investor.id);
  const saleId = text(raw.saleId, 80);
  if (!saleId) throw new Error("Venda não informada.");

  const { data: current, error: currentError } = await supabase
    .from("investor_financial_sale_entries")
    .select("id, investor_id, sale_status")
    .eq("id", saleId)
    .eq("investor_id", investorId)
    .maybeSingle();
  if (currentError) throw new Error(`Erro ao conferir venda: ${currentError.message}`);
  if (!current) throw new Error("Venda não encontrada no seu caixa.");

  const discountMode = ruleMode(raw.discountMode);
  const paymentMode = ruleMode(raw.paymentFeeMode);
  const storeMode = ruleMode(raw.storeFeeMode);
  const extraMode = ruleMode(raw.extraDeductionMode);

  const patch = {
    gross_amount_override: nullableMoney(raw.grossAmountOverride),
    discount_mode: discountMode,
    discount_value: ruleValue(discountMode, raw.discountValue),
    payment_fee_mode: paymentMode,
    payment_fee_value: ruleValue(paymentMode, raw.paymentFeeValue),
    store_fee_mode: storeMode,
    store_fee_value: ruleValue(storeMode, raw.storeFeeValue),
    extra_deduction_mode: extraMode,
    extra_deduction_value: ruleValue(extraMode, raw.extraDeductionValue),
    unit_cost: nonNegative(raw.unitCost),
    net_received_override: nullableMoney(raw.netReceivedOverride),
    notes: text(raw.notes, 1000) || null,
  };

  const { error } = await supabase
    .from("investor_financial_sale_entries")
    .update(patch)
    .eq("id", saleId)
    .eq("investor_id", investorId);
  if (error) throw new Error(`Não foi possível ajustar a venda: ${error.message}`);

  await audit({
    investorId,
    authUserId: session.authUser.id,
    action: "sale.adjust",
    entityType: "financial_sale",
    entityId: saleId,
    metadata: patch,
  });
  return true;
}

export async function saveInvestorCashTransaction(request: Request, raw: any) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const investorId = String(session.investor.id);
  const kind = String(raw.kind || "");
  if (!["income", "expense", "investment", "withdrawal"].includes(kind)) throw new Error("Tipo de movimentação inválido.");

  const description = text(raw.description, 180);
  if (!description) throw new Error("Informe a descrição da movimentação.");
  const value = nonNegative(raw.amount);
  if (value <= 0) throw new Error("Informe um valor maior que zero.");

  const lotId = text(raw.lotId, 80) || null;
  if (lotId) {
    const { data: participant, error: participantError } = await supabase
      .from("investment_lot_participants")
      .select("lot_id")
      .eq("lot_id", lotId)
      .eq("investor_id", investorId)
      .maybeSingle();
    if (participantError) throw new Error(`Erro ao validar lote: ${participantError.message}`);
    if (!participant) throw new Error("Este lote não pertence ao seu portal.");
  }

  const transactionId = text(raw.transactionId, 80);
  const row = {
    investor_id: investorId,
    lot_id: lotId,
    kind,
    category: text(raw.category, 100) || "Outros",
    description,
    amount: value,
    occurred_on: dateOnly(raw.occurredOn),
    payment_method: text(raw.paymentMethod, 80) || null,
    notes: text(raw.notes, 1000) || null,
    status: "active",
    voided_at: null,
  };

  let id = transactionId;
  if (transactionId) {
    const { data: existing, error: existingError } = await supabase
      .from("investor_cash_transactions")
      .select("id")
      .eq("id", transactionId)
      .eq("investor_id", investorId)
      .maybeSingle();
    if (existingError) throw new Error(`Erro ao conferir movimentação: ${existingError.message}`);
    if (!existing) throw new Error("Movimentação não encontrada.");
    const { error } = await supabase.from("investor_cash_transactions").update(row).eq("id", transactionId).eq("investor_id", investorId);
    if (error) throw new Error(`Não foi possível atualizar a movimentação: ${error.message}`);
  } else {
    const { data, error } = await supabase.from("investor_cash_transactions").insert(row).select("id").single();
    if (error || !data) throw new Error(error?.message || "Não foi possível cadastrar a movimentação.");
    id = String(data.id);
  }

  await audit({
    investorId,
    authUserId: session.authUser.id,
    action: transactionId ? "transaction.update" : "transaction.create",
    entityType: "cash_transaction",
    entityId: id,
    metadata: { kind, amount: value, category: row.category },
  });
  return id;
}

export async function voidInvestorCashTransaction(request: Request, raw: any) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const investorId = String(session.investor.id);
  const transactionId = text(raw.transactionId, 80);
  if (!transactionId) throw new Error("Movimentação não informada.");

  const { data, error } = await supabase
    .from("investor_cash_transactions")
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("investor_id", investorId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Não foi possível excluir a movimentação: ${error.message}`);
  if (!data) throw new Error("Movimentação não encontrada ou já excluída.");

  await audit({ investorId, authUserId: session.authUser.id, action: "transaction.void", entityType: "cash_transaction", entityId: transactionId });
  return true;
}

export async function saveInvestorProductCost(request: Request, raw: any) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const investorId = String(session.investor.id);
  const lotId = text(raw.lotId, 80);
  const variantId = text(raw.variantId, 80);
  if (!lotId || !variantId) throw new Error("Roupa do lote não informada.");

  const [{ data: participant, error: participantError }, { data: lotItem, error: itemError }] = await Promise.all([
    supabase.from("investment_lot_participants").select("lot_id").eq("lot_id", lotId).eq("investor_id", investorId).maybeSingle(),
    supabase.from("investment_lot_items").select("variant_id").eq("lot_id", lotId).eq("variant_id", variantId).maybeSingle(),
  ]);
  if (participantError) throw new Error(`Erro ao validar lote: ${participantError.message}`);
  if (itemError) throw new Error(`Erro ao validar roupa: ${itemError.message}`);
  if (!participant || !lotItem) throw new Error("Esta roupa não pertence a um lote do seu portal.");

  const unitCost = nonNegative(raw.unitCost);
  const plannedPrice = nullableMoney(raw.plannedPrice);
  const row = {
    investor_id: investorId,
    lot_id: lotId,
    variant_id: variantId,
    unit_cost: unitCost,
    planned_price: plannedPrice,
    notes: text(raw.notes, 700) || null,
  };
  const { error } = await supabase.from("investor_financial_product_costs").upsert(row, { onConflict: "investor_id,lot_id,variant_id" });
  if (error) throw new Error(`Não foi possível salvar o custo da roupa: ${error.message}`);

  if (Boolean(raw.applyExisting)) {
    const { error: salesError } = await supabase
      .from("investor_financial_sale_entries")
      .update({ unit_cost: unitCost })
      .eq("investor_id", investorId)
      .eq("lot_id", lotId)
      .eq("variant_id", variantId);
    if (salesError) throw new Error(`Custo salvo, mas não foi possível atualizar vendas anteriores: ${salesError.message}`);
  }

  await audit({
    investorId,
    authUserId: session.authUser.id,
    action: "product_cost.update",
    entityType: "product_cost",
    metadata: { lotId, variantId, unitCost, plannedPrice, applyExisting: Boolean(raw.applyExisting) },
  });
  return true;
}
