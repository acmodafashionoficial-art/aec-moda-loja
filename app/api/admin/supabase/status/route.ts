import { NextResponse } from "next/server";
import { getSupabaseSetupStatus } from "@/lib/supabase/status";
import { requireAdminApi } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function GET() {
  try { await requireAdminApi(); return NextResponse.json(await getSupabaseSetupStatus(), { headers: noStoreHeaders() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: securityStatus(error, 401), headers: noStoreHeaders() }); }
}
