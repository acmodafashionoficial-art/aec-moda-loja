import { NextResponse } from "next/server";
import {
  getInvestorFinanceDashboard,
  saveInvestorCashTransaction,
  saveInvestorFinanceSettings,
  saveInvestorProductCost,
  updateInvestorFinanceSale,
  voidInvestorCashTransaction,
} from "@/lib/investor-finance";
import { investorErrorStatus } from "@/lib/investor-portal";
import { noStoreHeaders, readJson } from "@/lib/security/request";

export async function GET(request: Request) {
  try {
    const dashboard = await getInvestorFinanceDashboard(request);
    return NextResponse.json({ dashboard }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o caixa do investidor." },
      { status: investorErrorStatus(error, 500), headers: noStoreHeaders() },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson<any>(request, 96 * 1024);
    const action = String(body.action || "");
    let result: unknown;

    if (action === "settings") result = await saveInvestorFinanceSettings(request, body);
    else if (action === "sale") result = await updateInvestorFinanceSale(request, body);
    else if (action === "transaction") result = await saveInvestorCashTransaction(request, body);
    else if (action === "void_transaction") result = await voidInvestorCashTransaction(request, body);
    else if (action === "product_cost") result = await saveInvestorProductCost(request, body);
    else throw new Error("Ação financeira inválida.");

    return NextResponse.json({ ok: true, result }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a alteração financeira." },
      { status: investorErrorStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}
