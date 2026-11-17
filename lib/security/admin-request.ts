import "server-only";

import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { assertSameOrigin, hashedClientId, SecurityError } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function requireAdminApi(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new SecurityError("Não autorizado.", 401);
  return session;
}

export async function requireOwnerApi(): Promise<AdminSession> {
  const session = await requireAdminApi();
  if (session.role !== "owner") throw new SecurityError("Somente a proprietária pode realizar esta ação.", 403);
  return session;
}

export async function requireAdminMutation(request: Request): Promise<AdminSession> {
  const session = await requireAdminApi();
  assertSameOrigin(request);
  const limit = await checkRateLimit(`admin-mutation:${session.id}:${hashedClientId(request, "admin-mutation")}`, { limit: 120, windowSeconds: 60, blockSeconds: 5 * 60 });
  if (!limit.allowed) throw new SecurityError("Muitas alterações em pouco tempo. Aguarde um momento.", 429);
  return session;
}

export async function requireOwnerMutation(request: Request): Promise<AdminSession> {
  const session = await requireOwnerApi();
  assertSameOrigin(request);
  const limit = await checkRateLimit(`owner-mutation:${session.id}:${hashedClientId(request, "owner-mutation")}`, { limit: 40, windowSeconds: 60, blockSeconds: 10 * 60 });
  if (!limit.allowed) throw new SecurityError("Muitas alterações de segurança em pouco tempo.", 429);
  return session;
}
