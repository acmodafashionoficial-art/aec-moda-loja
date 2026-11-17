import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  pbkdf2Sync,
} from "node:crypto";
import { assertProductionSecurity } from "@/lib/security/env";
import { getAdminUserById, hasActiveAdminUsers, type AdminRole, type AdminUser } from "@/lib/admin-users";

const DEV_COOKIE_NAME = "aec_admin_session";
const PROD_COOKIE_NAME = "__Host-aec_admin_session";
const DEV_PENDING_COOKIE = "aec_admin_pending";
const PROD_PENDING_COOKIE = "__Host-aec_admin_pending";
const DEV_ENROLL_COOKIE = "aec_admin_mfa_enroll";
const PROD_ENROLL_COOKIE = "__Host-aec_admin_mfa_enroll";
const SESSION_SECONDS = 60 * 60 * 4;
const PENDING_SECONDS = 15 * 60;
const USER_TOKEN_VERSION = "v3";
const LEGACY_TOKEN_VERSION = "v2";

export type AdminSession = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  sessionVersion: number;
  legacy: boolean;
};

export type PendingAdminAuth = {
  userId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  sessionVersion: number;
  mfaRequired: boolean;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userAgentHash: string;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieName() {
  return isProduction() ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
}

function pendingCookieName() {
  return isProduction() ? PROD_PENDING_COOKIE : DEV_PENDING_COOKIE;
}

function enrollCookieName() {
  return isProduction() ? PROD_ENROLL_COOKIE : DEV_ENROLL_COOKIE;
}

function sessionSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || "").trim();
}

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function userAgentHash(userAgent: string) {
  return createHash("sha256").update(userAgent).digest("hex").slice(0, 24);
}

function verifyPasswordHash(password: string, stored: string) {
  const [algorithm, iterationsRaw, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || !salt || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 310_000 || iterations > 2_000_000) return false;
  const calculated = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return safeEqual(calculated, expected);
}

/** Senha temporária de implantação. Ela deixa de funcionar quando a primeira conta individual é ativada. */
export function validateAdminPassword(password: string) {
  const normalized = String(password || "");
  if (normalized.length < 8 || normalized.length > 256) return false;
  const hash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (hash) return verifyPasswordHash(normalized, hash);
  if (isProduction()) return false;
  const plain = String(process.env.ADMIN_PASSWORD || "");
  return plain.length >= 12 && safeEqual(normalized, plain);
}

function sign(payload: string) {
  const secret = sessionSecret();
  if (secret.length < 48) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Compatibilidade apenas para o primeiro acesso da Fase 8. */
export function createAdminSessionToken(userAgent = "") {
  assertProductionSecurity();
  const now = Math.floor(Date.now() / 1000);
  const payload = [LEGACY_TOKEN_VERSION, now, now + SESSION_SECONDS, randomBytes(32).toString("base64url"), userAgentHash(userAgent)].join(".");
  return `${payload}.${sign(payload)}`;
}

export function createUserAdminSessionToken(user: Pick<AdminUser, "id" | "email" | "displayName" | "role" | "sessionVersion">, userAgent = "") {
  assertProductionSecurity();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    v: USER_TOKEN_VERSION,
    uid: user.id,
    email: user.email,
    name: user.displayName,
    role: user.role,
    sv: user.sessionVersion,
    iat: now,
    exp: now + SESSION_SECONDS,
    nonce: randomBytes(24).toString("base64url"),
    ua: userAgentHash(userAgent),
  };
  const payload = encodeJson(claims);
  return `${payload}.${sign(payload)}`;
}

function verifyLegacyToken(token: string, userAgent: string) {
  const parts = token.split(".");
  if (parts.length !== 6) return false;
  const [version, issuedRaw, expiresRaw, nonce, agent, receivedSignature] = parts;
  if (version !== LEGACY_TOKEN_VERSION || nonce.length < 32) return false;
  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(issuedAt) || !Number.isInteger(expiresAt)) return false;
  if (issuedAt > now + 60 || expiresAt <= now || expiresAt - issuedAt > SESSION_SECONDS + 60) return false;
  if (!safeEqual(agent, userAgentHash(userAgent))) return false;
  const payload = parts.slice(0, 5).join(".");
  const expected = sign(payload);
  return Boolean(expected) && safeEqual(receivedSignature, expected);
}

type UserClaims = {
  v: string;
  uid: string;
  email: string;
  name: string;
  role: AdminRole;
  sv: number;
  iat: number;
  exp: number;
  nonce: string;
  ua: string;
};

function verifyUserToken(token: string, userAgent: string): UserClaims | null {
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const received = token.slice(separator + 1);
  const expected = sign(payload);
  if (!expected || !safeEqual(received, expected)) return null;
  const claims = decodeJson<UserClaims>(payload);
  const now = Math.floor(Date.now() / 1000);
  if (!claims || claims.v !== USER_TOKEN_VERSION || claims.exp <= now || claims.iat > now + 60) return null;
  if (claims.exp - claims.iat > SESSION_SECONDS + 60 || claims.nonce.length < 20) return null;
  if (!safeEqual(claims.ua, userAgentHash(userAgent))) return null;
  if (!claims.uid || !claims.email || !["owner", "admin"].includes(claims.role)) return null;
  return claims;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const token = cookieStore.get(cookieName())?.value;
  const userAgent = headerStore.get("user-agent") || "";
  if (!token || sessionSecret().length < 48) return null;

  const claims = verifyUserToken(token, userAgent);
  if (claims) {
    const profile = await getAdminUserById(claims.uid);
    if (!profile || profile.status !== "active" || profile.sessionVersion !== claims.sv) return null;
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      sessionVersion: profile.sessionVersion,
      legacy: false,
    };
  }

  if (verifyLegacyToken(token, userAgent) && !(await hasActiveAdminUsers())) {
    return {
      id: "bootstrap",
      email: "",
      displayName: "Configuração inicial",
      role: "owner",
      sessionVersion: 0,
      legacy: true,
    };
  }
  return null;
}

export async function isAdminAuthenticated() {
  return Boolean(await getAdminSession());
}

export async function requireAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireOwnerPage() {
  const session = await requireAdminPage();
  if (session.role !== "owner") redirect("/admin");
  return session;
}

function encryptionKey() {
  return createHash("sha256").update(`${sessionSecret()}:admin-pending:v1`).digest();
}

export function sealPrivateState(value: unknown) {
  if (sessionSecret().length < 48) throw new Error("Chave de sessão inválida.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((item) => item.toString("base64url")).join(".");
}

export function unsealPrivateState<T>(token: string | undefined): T | null {
  if (!token || sessionSecret().length < 48) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = token.split(".");
    if (!ivRaw || !tagRaw || !encryptedRaw) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function getPendingAdminAuth(): Promise<PendingAdminAuth | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const pending = unsealPrivateState<PendingAdminAuth>(cookieStore.get(pendingCookieName())?.value);
  const now = Math.floor(Date.now() / 1000);
  if (!pending || pending.expiresAt <= now || pending.expiresAt > now + PENDING_SECONDS + 60) return null;
  if (!safeEqual(pending.userAgentHash, userAgentHash(headerStore.get("user-agent") || ""))) return null;
  const profile = await getAdminUserById(pending.userId);
  if (!profile || profile.status !== "active" || profile.sessionVersion !== pending.sessionVersion) return null;
  return pending;
}

export function createPendingAdminAuth(user: AdminUser, accessToken: string, refreshToken: string, userAgent: string) {
  const now = Math.floor(Date.now() / 1000);
  return sealPrivateState({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    sessionVersion: user.sessionVersion,
    mfaRequired: user.mfaRequired,
    accessToken,
    refreshToken,
    expiresAt: now + PENDING_SECONDS,
    userAgentHash: userAgentHash(userAgent),
  } satisfies PendingAdminAuth);
}

export function adminCookieName() { return cookieName(); }
export function adminPendingCookieName() { return pendingCookieName(); }
export function adminMfaEnrollCookieName() { return enrollCookieName(); }
export function adminSessionMaxAge() { return SESSION_SECONDS; }
export function adminPendingMaxAge() { return PENDING_SECONDS; }

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}
