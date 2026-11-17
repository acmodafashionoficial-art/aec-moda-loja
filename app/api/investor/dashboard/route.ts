import { NextResponse } from "next/server";
import { getInvestorPortalDashboard, investorErrorStatus } from "@/lib/investor-portal";
import { noStoreHeaders } from "@/lib/security/request";

export async function GET(request: Request) {
  try {
    const dashboard = await getInvestorPortalDashboard(request);
    return NextResponse.json({ dashboard }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o Portal do Investidor." },
      { status: investorErrorStatus(error, 500), headers: noStoreHeaders() },
    );
  }
}
