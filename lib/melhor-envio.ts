import "server-only";

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sealPrivateState, unsealPrivateState } from "@/lib/admin-auth";
import { getShippingSettings, type ShippingSettings } from "@/lib/shipping-settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MelhorEnvioTokenRecord = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  environment: "sandbox" | "production";
  scope?: string;
  updatedAt: string;
};

export type MelhorEnvioConnectionStatus = {
  connected: boolean;
  source: "environment" | "oauth" | "none";
  environment: "sandbox" | "production";
  expiresAt?: string;
  needsReconnect: boolean;
  clientConfigured: boolean;
  callbackUrl: string;
  message: string;
};

type OAuthAttempt = {
  version: 2;
  stateHash: string;
  environment: "sandbox" | "production";
  callbackUrl: string;
  adminId: string;
  issuedAt: number;
  expiresAt: number;
};

type EncryptedValue = {
  encrypted: true;
  iv: string;
  tag: string;
  payload: string;
};

const TOKEN_SECRET_ID = "melhor_envio";
const OAUTH_ATTEMPT_SECRET_ID = "melhor_envio_oauth_attempt";
const localTokenFile = path.join(process.cwd(), ".private", "melhor-envio-token.json");
const localAttemptFile = path.join(process.cwd(), ".private", "melhor-envio-oauth-attempt.json");

// O SDK oficial do Melhor Envio usa shipping-calculate no exemplo de autorização.
// A loja precisa apenas deste escopo para cotar PAC, SEDEX e transportadoras.
const DEFAULT_SCOPES = ["shipping-calculate"];

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function integrationKey() {
  const raw = String(process.env.INTEGRATION_ENCRYPTION_KEY || "").trim();
  return raw.length >= 48 ? crypto.createHash("sha256").update(raw).digest() : null;
}

function encryptValue(value: unknown): EncryptedValue {
  const key = integrationKey();
  if (!key) throw new Error("Configure INTEGRATION_ENCRYPTION_KEY antes de salvar integrações.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    encrypted: true,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    payload: encrypted.toString("base64"),
  };
}

function decryptValue<T>(value: unknown): T | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.encrypted !== true) return null;
  const key = integrationKey();
  if (!key) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(String(record.iv), "base64"));
    decipher.setAuthTag(Buffer.from(String(record.tag), "base64"));
    const decoded = Buffer.concat([
      decipher.update(Buffer.from(String(record.payload), "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

async function readSecret<T>(id: string, localFile: string): Promise<T | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from("integration_secrets").select("secret").eq("id", id).maybeSingle();
    if (!error && data?.secret) return decryptValue<T>(data.secret);
    if (error && !/does not exist|relation/i.test(error.message)) console.error(`Melhor Envio storage read (${id}):`, error.message);
  }
  if (isProductionRuntime()) return null;
  try {
    return decryptValue<T>(JSON.parse(await fs.readFile(localFile, "utf8")));
  } catch {
    return null;
  }
}

async function saveSecret(id: string, localFile: string, value: unknown) {
  const protectedValue = encryptValue(value);
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("integration_secrets").upsert({
      id,
      secret: protectedValue,
      updated_at: new Date().toISOString(),
    });
    if (!error) return;
    throw new Error(`Não foi possível guardar a integração no Supabase: ${error.message}`);
  }
  if (isProductionRuntime()) throw new Error("O Supabase administrativo não está disponível para guardar a integração.");
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, JSON.stringify(protectedValue, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function deleteSecret(id: string, localFile: string) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("integration_secrets").delete().eq("id", id);
    if (error && !/does not exist|relation/i.test(error.message)) console.error(`Melhor Envio storage delete (${id}):`, error.message);
  }
  if (!isProductionRuntime()) await fs.rm(localFile, { force: true });
}

function cleanEnvironmentValue(name: string) {
  const raw = String(process.env[name] || "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export function getMelhorEnvioBaseUrl(settings: Pick<ShippingSettings, "environment">) {
  const override = cleanEnvironmentValue("MELHOR_ENVIO_API_URL_OVERRIDE").replace(/\/$/, "");
  if (override && !isProductionRuntime()) {
    const url = new URL(override);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("A URL alternativa do Melhor Envio é insegura.");
    return override;
  }
  return settings.environment === "production" ? "https://melhorenvio.com.br" : "https://sandbox.melhorenvio.com.br";
}

export function getMelhorEnvioCallbackUrl() {
  const configured = cleanEnvironmentValue("MELHOR_ENVIO_CALLBACK_URL");
  const fallback = `${cleanEnvironmentValue("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000"}/api/admin/melhor-envio/callback`;
  const callback = (configured || fallback).replace(/([^:]\/)\/+/, "$1");
  let parsed: URL;
  try {
    parsed = new URL(callback);
  } catch {
    throw new Error("MELHOR_ENVIO_CALLBACK_URL não contém uma URL válida.");
  }
  if (isProductionRuntime() && parsed.protocol !== "https:") throw new Error("A URL de retorno do Melhor Envio precisa usar HTTPS em produção.");
  return parsed.toString().replace(/\/$/, "");
}

function getClientCredentials() {
  const clientId = cleanEnvironmentValue("MELHOR_ENVIO_CLIENT_ID");
  const clientSecret = cleanEnvironmentValue("MELHOR_ENVIO_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Configure MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET na Vercel.");
  return { clientId, clientSecret };
}

function getUserAgent() {
  const value = cleanEnvironmentValue("MELHOR_ENVIO_USER_AGENT") || "A&C Moda (suporte@aecmoda.com.br)";
  if (!/@/.test(value)) throw new Error("MELHOR_ENVIO_USER_AGENT precisa conter o nome da aplicação e um e-mail de contato.");
  return value;
}

function getRequestedScopes() {
  const configured = cleanEnvironmentValue("MELHOR_ENVIO_SCOPES");
  const scopes = configured
    ? configured.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
    : DEFAULT_SCOPES;
  return Array.from(new Set(scopes)).slice(0, 20);
}

function hashState(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = crypto.createHash("sha256").update(left).digest();
  const b = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(a, b);
}

export function melhorEnvioOAuthCookieName() {
  return isProductionRuntime() ? "__Host-aec_me_oauth" : "aec_me_oauth";
}

export function melhorEnvioOAuthCookieOptions(maxAge = 15 * 60) {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export async function createMelhorEnvioOAuthRequest(settings: ShippingSettings, adminId: string) {
  const { clientId } = getClientCredentials();
  getUserAgent();
  const callbackUrl = getMelhorEnvioCallbackUrl();
  const state = crypto.randomBytes(32).toString("hex"); // mesmo formato de 64 caracteres usado pelo SDK oficial
  const now = Math.floor(Date.now() / 1000);
  const attempt: OAuthAttempt = {
    version: 2,
    stateHash: hashState(state),
    environment: settings.environment,
    callbackUrl,
    adminId,
    issuedAt: now,
    expiresAt: now + 15 * 60,
  };
  await saveSecret(OAUTH_ATTEMPT_SECRET_ID, localAttemptFile, attempt);

  const url = new URL(`${getMelhorEnvioBaseUrl(settings)}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);

  // O SDK oficial envia scope como array no query string (scope[0], scope[1]...).
  getRequestedScopes().forEach((scope, index) => url.searchParams.append(`scope[${index}]`, scope));

  return { url: url.toString(), cookieValue: sealPrivateState(attempt) };
}

function validAttempt(attempt: OAuthAttempt | null, environment: "sandbox" | "production", callbackUrl: string) {
  const now = Math.floor(Date.now() / 1000);
  return Boolean(
    attempt &&
      attempt.version === 2 &&
      attempt.environment === environment &&
      attempt.callbackUrl === callbackUrl &&
      attempt.issuedAt <= now + 60 &&
      attempt.expiresAt > now &&
      attempt.expiresAt - attempt.issuedAt <= 16 * 60,
  );
}

export async function verifyAndConsumeMelhorEnvioOAuthAttempt(input: {
  returnedState: string;
  cookieValue?: string;
  environment: "sandbox" | "production";
}) {
  const callbackUrl = getMelhorEnvioCallbackUrl();
  const stored = await readSecret<OAuthAttempt>(OAUTH_ATTEMPT_SECRET_ID, localAttemptFile);
  const cookie = unsealPrivateState<OAuthAttempt>(input.cookieValue);
  const state = input.returnedState.trim();
  const stateHash = state ? hashState(state) : "";

  const storedValid = validAttempt(stored, input.environment, callbackUrl);
  const cookieValid = validAttempt(cookie, input.environment, callbackUrl);

  let accepted = false;
  if (state) {
    accepted = Boolean(
      (storedValid && stored && safeEqual(stored.stateHash, stateHash)) ||
        (cookieValid && cookie && safeEqual(cookie.stateHash, stateHash)),
    );
  } else {
    // O SDK oficial tolera state vazio. Aqui só aceitamos esse caso quando há uma
    // tentativa assinada e ainda válida no mesmo navegador.
    accepted = cookieValid;
  }

  await deleteSecret(OAUTH_ATTEMPT_SECRET_ID, localAttemptFile);
  return accepted;
}

function providerErrorMessage(status: number, data: Record<string, unknown>) {
  const code = String(data.error || "").toLowerCase();
  const description = String(data.error_description || data.message || "").slice(0, 300);
  if (/invalid_client|client/.test(code) || (status === 401 && /client|secret/i.test(description))) {
    return "O Melhor Envio recusou o Client ID ou o Secret. Confira as credenciais do mesmo aplicativo e ambiente.";
  }
  if (/invalid_grant/.test(code) || /authorization code|código.*expir|redirect/i.test(description)) {
    return "O código de autorização expirou ou a URL de retorno não coincide exatamente com a cadastrada no Melhor Envio.";
  }
  if (/invalid_scope/.test(code) || /scope|permiss/i.test(description)) {
    return "O Melhor Envio recusou as permissões solicitadas. Mantenha somente a permissão shipping-calculate no primeiro teste.";
  }
  if (description) return `O Melhor Envio recusou a conexão: ${description}`;
  return `O Melhor Envio recusou a conexão (HTTP ${status}).`;
}

async function requestToken(
  payload: Record<string, string>,
  settings: ShippingSettings,
  previousRefreshToken?: string,
) {
  const response = await fetch(`${getMelhorEnvioBaseUrl(settings)}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent(),
    },
    body: new URLSearchParams(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  if (!response.ok || !data.access_token) {
    console.error("Melhor Envio OAuth token error:", response.status, String(data.error || data.message || "unknown"));
    throw new Error(providerErrorMessage(response.status, data));
  }

  const expiresIn = Math.max(60, Number(data.expires_in) || 30 * 24 * 60 * 60);
  const token: MelhorEnvioTokenRecord = {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : previousRefreshToken,
    tokenType: String(data.token_type || "Bearer"),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    environment: settings.environment,
    scope: Array.isArray(data.scope) ? data.scope.map(String).join(" ") : String(data.scope || getRequestedScopes().join(" ")),
    updatedAt: new Date().toISOString(),
  };
  await saveSecret(TOKEN_SECRET_ID, localTokenFile, token);
  return token;
}

export async function exchangeMelhorEnvioCode(code: string) {
  const settings = await getShippingSettings();
  const { clientId, clientSecret } = getClientCredentials();
  return requestToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getMelhorEnvioCallbackUrl(),
    code,
  }, settings);
}

async function refreshToken(token: MelhorEnvioTokenRecord, settings: ShippingSettings) {
  const { clientId, clientSecret } = getClientCredentials();
  if (!token.refreshToken) return null;
  try {
    return await requestToken({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
    }, settings, token.refreshToken);
  } catch (error) {
    console.error("Melhor Envio refresh failed:", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function saveMelhorEnvioToken(token: MelhorEnvioTokenRecord) {
  await saveSecret(TOKEN_SECRET_ID, localTokenFile, token);
}

export async function deleteMelhorEnvioToken() {
  await deleteSecret(TOKEN_SECRET_ID, localTokenFile);
}

function expiresSoon(expiresAt?: string, minutes = 24 * 60) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() - Date.now() < minutes * 60_000);
}

export async function getValidMelhorEnvioToken(forceRefresh = false) {
  const environmentToken = cleanEnvironmentValue("MELHOR_ENVIO_TOKEN");
  if (environmentToken) return { accessToken: environmentToken, source: "environment" as const };

  const settings = await getShippingSettings();
  let token = await readSecret<MelhorEnvioTokenRecord>(TOKEN_SECRET_ID, localTokenFile);
  if (!token || token.environment !== settings.environment) return null;
  if (forceRefresh || expiresSoon(token.expiresAt)) {
    token = await refreshToken(token, settings);
    if (!token) return null;
  }
  return { accessToken: token.accessToken, source: "oauth" as const, record: token };
}

export async function getMelhorEnvioConnectionStatus(): Promise<MelhorEnvioConnectionStatus> {
  const settings = await getShippingSettings();
  const callbackUrl = getMelhorEnvioCallbackUrl();
  const clientId = cleanEnvironmentValue("MELHOR_ENVIO_CLIENT_ID");
  const clientSecret = cleanEnvironmentValue("MELHOR_ENVIO_CLIENT_SECRET");
  const clientConfigured = Boolean(clientId && clientSecret);
  const environmentToken = cleanEnvironmentValue("MELHOR_ENVIO_TOKEN");

  if (environmentToken) {
    return {
      connected: true,
      source: "environment",
      environment: settings.environment,
      needsReconnect: false,
      clientConfigured,
      callbackUrl,
      message: "Conectado por token seguro do servidor.",
    };
  }

  const token = await readSecret<MelhorEnvioTokenRecord>(TOKEN_SECRET_ID, localTokenFile);
  if (!token || token.environment !== settings.environment) {
    return {
      connected: false,
      source: "none",
      environment: settings.environment,
      needsReconnect: false,
      clientConfigured,
      callbackUrl,
      message: clientConfigured ? "Pronto para conectar a conta." : "Informe Client ID e Secret na Vercel.",
    };
  }
  const needsReconnect = expiresSoon(token.expiresAt, 0) && !token.refreshToken;
  return {
    connected: !needsReconnect,
    source: "oauth",
    environment: settings.environment,
    expiresAt: token.expiresAt,
    needsReconnect,
    clientConfigured,
    callbackUrl,
    message: needsReconnect ? "A autorização venceu. Conecte novamente." : "Conta Melhor Envio conectada.",
  };
}

export async function melhorEnvioFetch(pathname: string, init: RequestInit = {}) {
  const settings = await getShippingSettings();
  const token = await getValidMelhorEnvioToken();
  if (!token) throw new Error("A conta do Melhor Envio ainda não está conectada.");

  const run = (accessToken: string) => fetch(`${getMelhorEnvioBaseUrl(settings)}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getUserAgent(),
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  let response = await run(token.accessToken);
  if ((response.status === 401 || response.status === 403) && token.source === "oauth") {
    const refreshed = await getValidMelhorEnvioToken(true);
    if (refreshed) response = await run(refreshed.accessToken);
  }
  return response;
}
