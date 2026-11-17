import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashedClientId } from "@/lib/security/request";
import { getAdminSession } from "@/lib/admin-auth";

export type AuditInput = {
  request?: Request;
  action: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: "success" | "failure";
  actor?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

function safeMetadata(input: Record<string, unknown> | undefined) {
  if (!input) return {};
  const blocked = /password|secret|token|authorization|cookie|document|cpf|cnpj/i;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.test(key)).slice(0, 30));
}

export async function writeAudit(input: AuditInput) {
  const supabase = getSupabaseAdmin();
  let actor = input.actor;
  let actorId = input.actorId;
  if (!actor && !actorId) {
    try {
      const session = await getAdminSession();
      actor = session?.email || session?.displayName || "admin";
      actorId = session && !session.legacy ? session.id : undefined;
    } catch {
      actor = "admin";
    }
  }
  const row = {
    actor: String(actor || "admin").slice(0, 180),
    actor_id: actorId || null,
    action: String(input.action).slice(0, 120),
    resource_type: input.resourceType ? String(input.resourceType).slice(0, 80) : null,
    resource_id: input.resourceId ? String(input.resourceId).slice(0, 180) : null,
    outcome: input.outcome || "success",
    ip_hash: input.request ? hashedClientId(input.request, "audit") : null,
    user_agent: input.request ? String(input.request.headers.get("user-agent") || "").slice(0, 300) : null,
    metadata: safeMetadata(input.metadata),
    created_at: new Date().toISOString(),
  };
  if (supabase) {
    const { error } = await supabase.from("admin_audit_logs").insert(row);
    if (!error) return;
    // Compatibilidade com a tabela anterior à Fase 8.1.
    if (/actor_id|column/i.test(error.message)) {
      const legacyRow = { ...row } as Record<string, unknown>;
      delete legacyRow.actor_id;
      const fallback = await supabase.from("admin_audit_logs").insert(legacyRow);
      if (!fallback.error) return;
    }
    if (!/does not exist|relation/i.test(error.message)) console.error("Auditoria:", error.message);
  }
  console.info("AUDIT", JSON.stringify({ ...row, user_agent: undefined }));
}

export async function recentAuditLogs(limit = 50) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("id, actor, actor_id, action, resource_type, resource_id, outcome, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) return [];
  return data || [];
}
