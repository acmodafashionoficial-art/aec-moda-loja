import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  adminCookieName,
  adminMfaEnrollCookieName,
  adminPendingCookieName,
  adminSessionMaxAge,
  authCookieOptions,
  createUserAdminSessionToken,
  getPendingAdminAuth,
  unsealPrivateState,
} from "@/lib/admin-auth";
import { getPendingMfaClient, verifiedTotpFactors } from "@/lib/admin-mfa";
import { getAdminUserById, updateAdminLastLogin } from "@/lib/admin-users";
import { writeAudit } from "@/lib/security/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

type EnrollmentState = { factorId: string; userId: string; expiresAt: number };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const pending = await getPendingAdminAuth();
    if (!pending) throw new Error("A etapa de login expirou. Entre novamente.");
    const limit = await checkRateLimit(`admin-mfa:${pending.userId}:${hashedClientId(request, "mfa")}`, { limit: 8, windowSeconds: 10 * 60, blockSeconds: 20 * 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429, headers: noStoreHeaders() });

    const body = await readJson<{ code?: unknown; mode?: unknown }>(request, 4 * 1024);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
    const mode = body.mode === "enroll" ? "enroll" : "challenge";
    if (!/^\d{6}$/.test(code)) throw new Error("Digite o código de 6 números.");

    const { client } = await getPendingMfaClient();
    let factorId = "";
    if (mode === "enroll") {
      const cookieStore = await cookies();
      const state = unsealPrivateState<EnrollmentState>(cookieStore.get(adminMfaEnrollCookieName())?.value);
      if (!state || state.userId !== pending.userId || state.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("A configuração expirou. Gere um novo QR Code.");
      factorId = state.factorId;
    } else {
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      factorId = verifiedTotpFactors(factors.data)[0]?.id || "";
      if (!factorId) throw new Error("Nenhum autenticador foi encontrado. Configure a verificação em duas etapas.");
    }

    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw new Error("Código inválido ou expirado.");
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error) {
      await writeAudit({ request, actor: pending.email, action: "admin.mfa_verify", outcome: "failure" });
      throw new Error("Código inválido ou expirado.");
    }

    const profile = await getAdminUserById(pending.userId);
    if (!profile || profile.status !== "active" || profile.sessionVersion !== pending.sessionVersion) throw new Error("Conta administrativa indisponível.");
    const userAgent = request.headers.get("user-agent") || "";
    const response = NextResponse.json({ ok: true, next: "/admin" }, { headers: noStoreHeaders() });
    response.cookies.set(adminCookieName(), createUserAdminSessionToken(profile, userAgent), authCookieOptions(adminSessionMaxAge()));
    response.cookies.set(adminPendingCookieName(), "", authCookieOptions(0));
    response.cookies.set(adminMfaEnrollCookieName(), "", authCookieOptions(0));
    await updateAdminLastLogin(profile.id);
    await writeAudit({ request, actor: profile.email, action: mode === "enroll" ? "admin.mfa_enabled" : "admin.login", outcome: "success", metadata: { mfa: true } });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível validar o código." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
