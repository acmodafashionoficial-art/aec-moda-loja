import { NextResponse } from "next/server";
import {
  adminCookieName,
  adminPendingCookieName,
  adminPendingMaxAge,
  adminSessionMaxAge,
  authCookieOptions,
  createAdminSessionToken,
  createPendingAdminAuth,
  createUserAdminSessionToken,
  validateAdminPassword,
} from "@/lib/admin-auth";
import { getAdminUserById, hasActiveAdminUsers, updateAdminLastLogin } from "@/lib/admin-users";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import { writeAudit } from "@/lib/security/audit";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { assertSameOrigin, hashedClientId, noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: unknown; password?: unknown }>(request, 12 * 1024);
    const email = normalizedEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const activeAdmins = await hasActiveAdminUsers();
    const key = `admin-login:${email || "bootstrap"}:${hashedClientId(request, "login")}`;
    const limit = await checkRateLimit(key, { limit: 5, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });

    if (!limit.allowed) {
      await writeAudit({ request, actor: email || "bootstrap", action: "admin.login", outcome: "failure", metadata: { reason: "rate_limited" } });
      return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    }

    // Primeiro acesso: a senha protegida da Fase 8 abre apenas a tela para convidar a proprietária.
    if (!activeAdmins && !email) {
      if (!validateAdminPassword(password)) {
        await writeAudit({ request, actor: "bootstrap", action: "admin.bootstrap_login", outcome: "failure" });
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 350)));
        return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401, headers: noStoreHeaders(rateLimitHeaders(limit)) });
      }
      const userAgent = request.headers.get("user-agent") || "";
      const response = NextResponse.json({ ok: true, next: "/admin/usuarios" }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
      response.cookies.set(adminCookieName(), createAdminSessionToken(userAgent), authCookieOptions(adminSessionMaxAge()));
      await writeAudit({ request, actor: "bootstrap", action: "admin.bootstrap_login", outcome: "success" });
      return response;
    }

    if (!email || password.length < 8) {
      return NextResponse.json({ error: "Informe o e-mail e a senha da sua conta." }, { status: 400, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    }

    const auth = getSupabaseAuthClient();
    if (!auth) throw new Error("Supabase Auth ainda não foi configurado.");
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      await writeAudit({ request, actor: email, action: "admin.login", outcome: "failure", metadata: { reason: "invalid_credentials" } });
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 350)));
      return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    }

    const profile = await getAdminUserById(data.user.id);
    if (!profile || profile.status !== "active") {
      await auth.auth.signOut();
      await writeAudit({ request, actor: email, action: "admin.login", outcome: "failure", metadata: { reason: "inactive_account" } });
      return NextResponse.json({ error: "Conta sem autorização para acessar o painel." }, { status: 403, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    }

    const userAgent = request.headers.get("user-agent") || "";
    const pendingToken = createPendingAdminAuth(profile, data.session.access_token, data.session.refresh_token, userAgent);
    const factors = await auth.auth.mfa.listFactors();
    const verifiedTotp = factors.data?.totp?.filter((factor) => factor.status === "verified") || [];

    if (!profile.mfaRequired) {
      const response = NextResponse.json({ ok: true, next: "/admin" }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
      response.cookies.set(adminCookieName(), createUserAdminSessionToken(profile, userAgent), authCookieOptions(adminSessionMaxAge()));
      await updateAdminLastLogin(profile.id);
      await writeAudit({ request, actor: profile.email, action: "admin.login", outcome: "success", metadata: { mfa: false } });
      return response;
    }

    const next = verifiedTotp.length ? "/admin/verificar-2fa" : "/admin/configurar-2fa";
    const response = NextResponse.json({ ok: true, next }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
    response.cookies.set(adminPendingCookieName(), pendingToken, authCookieOptions(adminPendingMaxAge()));
    response.cookies.set(adminCookieName(), "", authCookieOptions(0));
    await writeAudit({ request, actor: profile.email, action: "admin.password_verified", outcome: "success", metadata: { next } });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível entrar." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
