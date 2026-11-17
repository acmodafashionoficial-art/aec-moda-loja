import { NextResponse } from "next/server";
import { activateInvestorPortal, investorErrorStatus } from "@/lib/investor-portal";
import { noStoreHeaders } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    const investor = await activateInvestorPortal(request);
    return NextResponse.json({ ok: true, investor }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao ativar o acesso." },
      { status: investorErrorStatus(error, 500), headers: noStoreHeaders() },
    );
  }
}
