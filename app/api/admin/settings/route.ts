import { NextResponse } from "next/server";
import { getStoreSettings, saveStoreSettings } from "@/lib/store-settings";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminApi, requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function GET() {
  try { await requireAdminApi(); return NextResponse.json({ settings: await getStoreSettings() }, { headers: noStoreHeaders() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: securityStatus(error, 401), headers: noStoreHeaders() }); }
}

export async function PUT(request: Request) {
  try {
    await requireAdminMutation(request);
    const settings = await saveStoreSettings(await readJson(request, 128 * 1024));
    await writeAudit({ request, action: "store_settings.update", resourceType: "settings" });
    return NextResponse.json({ settings }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
