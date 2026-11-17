import { NextResponse } from "next/server";
import { acceptInvestorPortalInvite, investorErrorStatus } from "@/lib/investor-portal";
import { noStoreHeaders, readJson } from "@/lib/security/request";

type Body = { token?: unknown; password?: unknown };

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request, 16 * 1024);
    const result = await acceptInvestorPortalInvite({
      token: String(body.token || ""),
      password: String(body.password || ""),
    });
    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível aceitar o convite." },
      { status: investorErrorStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}
