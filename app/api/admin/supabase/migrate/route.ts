import { NextResponse } from "next/server";
import { migrateLocalDataToSupabase } from "@/lib/supabase/setup";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    const result = await migrateLocalDataToSupabase();
    await writeAudit({ request, action: "supabase.migrate", resourceType: "database" });
    return NextResponse.json({ ok: true, result }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro na migração." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
