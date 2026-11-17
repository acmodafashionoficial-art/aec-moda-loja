import { NextResponse } from "next/server";
import { getPaymentSettings, savePaymentSettings } from "@/lib/payment-settings";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminApi, requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function GET() {
  try { await requireAdminApi(); return NextResponse.json({ settings: await getPaymentSettings() }, { headers: noStoreHeaders() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: securityStatus(error, 401), headers: noStoreHeaders() }); }
}

export async function PUT(request: Request) {
  try {
    await requireAdminMutation(request);
    const settings = await savePaymentSettings(await readJson(request, 32 * 1024));
    await writeAudit({ request, action: "payments.update", resourceType: "settings", metadata: { enabled: settings.checkoutEnabled, maxInstallments: settings.maxInstallments } });
    return NextResponse.json({ settings }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
