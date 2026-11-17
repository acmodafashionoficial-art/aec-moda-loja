import { NextResponse } from "next/server";
import { getMelhorEnvioConnectionStatus } from "@/lib/melhor-envio";
import { getShippingSettings, saveShippingSettings } from "@/lib/shipping-settings";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminApi, requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function GET() {
  try {
    await requireAdminApi();
    const [settings, connection] = await Promise.all([getShippingSettings(), getMelhorEnvioConnectionStatus()]);
    return NextResponse.json({ settings, connection }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: securityStatus(error, 401), headers: noStoreHeaders() });
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminMutation(request);
    const settings = await saveShippingSettings(await readJson(request, 128 * 1024));
    const connection = await getMelhorEnvioConnectionStatus();
    await writeAudit({ request, action: "shipping.update", resourceType: "settings", metadata: { environment: settings.environment, enabled: settings.enabled } });
    return NextResponse.json({ settings, connection }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar as configurações." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
