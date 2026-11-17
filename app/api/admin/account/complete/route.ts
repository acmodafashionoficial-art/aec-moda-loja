import { NextResponse } from "next/server";
import { activateAdminUser, completePasswordReset, getAdminUserById } from "@/lib/admin-users";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/security/audit";
import { noStoreHeaders, readJson } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!accessToken) throw new Error("Sessão de confirmação ausente.");
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase não configurado.");
    const verified = await supabase.auth.getUser(accessToken);
    if (verified.error || !verified.data.user) throw new Error("O link expirou. Solicite um novo.");
    const body = await readJson<{ mode?: unknown; displayName?: unknown }>(request, 8 * 1024);
    const mode = body.mode === "reset" ? "reset" : "invite";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 120) : "";
    const profile = await getAdminUserById(verified.data.user.id);
    if (!profile) throw new Error("Este e-mail não possui autorização administrativa.");

    if (mode === "invite") {
      if (displayName.length < 2) throw new Error("Informe o nome da administradora.");
      await activateAdminUser(profile.id, displayName);
    } else {
      await completePasswordReset(profile.id, displayName || undefined);
    }

    await writeAudit({ request, actor: profile.email, action: mode === "invite" ? "admin_user.activated" : "admin.password_reset", resourceType: "admin_user", resourceId: profile.id });
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400, headers: noStoreHeaders() });
  }
}
