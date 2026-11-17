import "server-only";

import { getPendingAdminAuth } from "@/lib/admin-auth";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export async function getPendingMfaClient() {
  const pending = await getPendingAdminAuth();
  if (!pending) throw new Error("A etapa de login expirou. Entre novamente.");
  const client = getSupabaseAuthClient();
  if (!client) throw new Error("Supabase Auth não configurado.");
  const { error } = await client.auth.setSession({
    access_token: pending.accessToken,
    refresh_token: pending.refreshToken,
  });
  if (error) throw new Error("A etapa de login expirou. Entre novamente.");
  return { client, pending };
}

export function verifiedTotpFactors(data: { totp?: Array<{ id: string; status?: string }> } | null | undefined) {
  return (data?.totp || []).filter((factor) => factor.status === "verified");
}
