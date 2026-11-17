import { NextResponse } from "next/server";
import { getAdminUserByEmail } from "@/lib/admin-users";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import { writeAudit } from "@/lib/security/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await checkRateLimit(`admin-recovery:${hashedClientId(request, "recovery")}`, { limit: 3, windowSeconds: 60 * 60, blockSeconds: 60 * 60 });
    const generic = "Se o e-mail estiver autorizado, enviaremos as instruções de recuperação.";
    if (!limit.allowed) return NextResponse.json({ ok: true, message: generic }, { headers: noStoreHeaders() });
    const body = await readJson<{ email?: unknown }>(request, 4 * 1024);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const profile = await getAdminUserByEmail(email);
    if (profile?.status === "active") {
      const auth = getSupabaseAuthClient();
      const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
      if (auth) await auth.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/admin/redefinir-senha` });
      await writeAudit({ request, actor: email, action: "admin.password_recovery_requested", outcome: "success" });
    }
    return NextResponse.json({ ok: true, message: generic }, { headers: noStoreHeaders() });
  } catch {
    return NextResponse.json({ ok: true, message: "Se o e-mail estiver autorizado, enviaremos as instruções de recuperação." }, { headers: noStoreHeaders() });
  }
}
