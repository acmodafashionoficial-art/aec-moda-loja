import { NextResponse } from "next/server";
import { adminCookieName, authCookieOptions } from "@/lib/admin-auth";
import { getAdminUserById } from "@/lib/admin-users";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { writeAudit } from "@/lib/security/audit";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    if (session.legacy) throw new Error("Crie primeiro uma conta individual.");
    const profile = await getAdminUserById(session.id);
    const supabase = getSupabaseAdmin();
    if (!profile || !supabase) throw new Error("Conta não encontrada.");
    const { error } = await supabase.from("admin_users").update({ session_version: profile.sessionVersion + 1 }).eq("id", profile.id);
    if (error) throw new Error(error.message);
    const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
    response.cookies.set(adminCookieName(), "", authCookieOptions(0));
    await writeAudit({ request, actor: session.email, action: "admin.sessions_revoked", resourceType: "admin_user", resourceId: session.id });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível encerrar as sessões." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
