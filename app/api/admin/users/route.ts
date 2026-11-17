import { NextResponse } from "next/server";
import { hasActiveAdminUsers } from "@/lib/admin-users";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOwnerMutation } from "@/lib/security/admin-request";
import { writeAudit } from "@/lib/security/audit";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

function siteUrl() {
  const value = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return value;
}

export async function POST(request: Request) {
  try {
    const session = await requireOwnerMutation(request);
    const body = await readJson<{ email?: unknown; displayName?: unknown; role?: unknown }>(request, 12 * 1024);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 120) : "";
    let role = body.role === "owner" ? "owner" : "admin";
    if (!email.includes("@") || displayName.length < 2) throw new Error("Informe nome e e-mail válidos.");

    const activeAdmins = await hasActiveAdminUsers();
    if (!activeAdmins) role = "owner";

    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase não configurado.");
    const existing = await supabase.from("admin_users").select("id,status").eq("email", email).maybeSingle();
    if (existing.data) throw new Error("Já existe uma conta ou convite para este e-mail.");

    const invited = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl()}/admin/aceitar-convite`,
      data: { display_name: displayName, admin_role: role },
    });
    if (invited.error || !invited.data.user) throw new Error(invited.error?.message || "Não foi possível enviar o convite.");

    const { error } = await supabase.from("admin_users").insert({
      id: invited.data.user.id,
      email,
      display_name: displayName,
      role,
      status: "invited",
      mfa_required: true,
      session_version: 1,
      invited_by: session.legacy ? null : session.id,
    });
    if (error) {
      await supabase.auth.admin.deleteUser(invited.data.user.id);
      throw new Error(error.message);
    }

    await writeAudit({ request, actor: session.email || "bootstrap", action: "admin_user.invite", resourceType: "admin_user", resourceId: invited.data.user.id, metadata: { email, role } });
    return NextResponse.json({ ok: true, message: `Convite enviado para ${email}.` }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível convidar." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
