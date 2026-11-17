import "server-only";

import { createHash } from "node:crypto";

const JSON_TYPES = ["application/json", "application/ld+json"];

function configuredSiteUrl() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashedClientId(request: Request, scope = "request") {
  const pepper = process.env.RATE_LIMIT_PEPPER || process.env.ADMIN_SESSION_SECRET || "local-rate-limit";
  return createHash("sha256")
    .update(`${scope}|${clientIp(request)}|${request.headers.get("user-agent") || ""}|${pepper}`)
    .digest("hex");
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  const configured = new URL(configuredSiteUrl());
  const requestUrl = new URL(request.url);
  const allowedHosts = new Set([
    configured.host,
    requestUrl.host,
    "localhost:3000",
    "127.0.0.1:3000",
  ]);

  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    throw new SecurityError("Origem da solicitação não permitida.", 403);
  }
  if (origin) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new SecurityError("Origem inválida.", 403); }
    if (!allowedHosts.has(parsed.host)) throw new SecurityError("Origem da solicitação não permitida.", 403);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new SecurityError("Conexão segura obrigatória.", 403);
    }
  }
}

export function requireJson(request: Request) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!JSON_TYPES.includes(type)) throw new SecurityError("Tipo de conteúdo inválido.", 415);
}

export function enforceContentLength(request: Request, maxBytes: number) {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const length = Number(raw);
  if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
    throw new SecurityError("Solicitação muito grande.", 413);
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 128 * 1024): Promise<T> {
  requireJson(request);
  enforceContentLength(request, maxBytes);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new SecurityError("Solicitação muito grande.", 413);
  try { return JSON.parse(text) as T; }
  catch { throw new SecurityError("JSON inválido.", 400); }
}

export function noStoreHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

export class SecurityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SecurityError";
    this.status = status;
  }
}

export function securityStatus(error: unknown, fallback = 400) {
  return error instanceof SecurityError ? error.status : fallback;
}
