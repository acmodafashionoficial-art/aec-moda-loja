import { NextResponse } from "next/server";
import { deleteMelhorEnvioToken } from "@/lib/melhor-envio";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    await deleteMelhorEnvioToken();
    await writeAudit({ request, action: "shipping.disconnect", resourceType: "integration" });
    const response = NextResponse.redirect(new URL("/admin/fretes?disconnected=1", request.url), { status: 303 });
    noStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: securityStatus(error, 401), headers: noStoreHeaders() });
  }
}
