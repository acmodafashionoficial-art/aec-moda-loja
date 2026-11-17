import { NextResponse } from "next/server";
import { melhorEnvioFetch } from "@/lib/melhor-envio";
import { requireAdminApi } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

function companyName(service: Record<string, unknown>) {
  const company = service.company as Record<string, unknown> | undefined;
  return String(company?.name || "Transportadora").slice(0, 120);
}

export async function GET() {
  try {
    await requireAdminApi();
    const response = await melhorEnvioFetch("/api/v2/me/shipment/services");
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(String(data?.message || data?.error || "Não foi possível consultar os serviços."));
    const services = (Array.isArray(data) ? data : []).slice(0, 100).map((raw) => {
      const service = raw as Record<string, unknown>;
      const id = String(service.id || "").replace(/\D/g, "").slice(0, 8);
      const company = companyName(service);
      const companyData = service.company as Record<string, unknown> | undefined;
      const picture = String(companyData?.picture || "");
      return {
        id,
        name: String(service.name || `Serviço ${id}`).slice(0, 120),
        company,
        companyId: String(companyData?.id || "").replace(/\D/g, "").slice(0, 8),
        picture: picture.startsWith("https://") ? picture.slice(0, 500) : "",
        isCorreios: ["1", "2", "17"].includes(id) || company.toLowerCase().includes("correios"),
      };
    });
    return NextResponse.json({ services }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar os serviços." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
