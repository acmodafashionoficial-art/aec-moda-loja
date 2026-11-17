import { NextResponse } from "next/server";
import { countActiveOwners, getAdminUserById } from "@/lib/admin-users";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOwnerMutation } from "@/lib/security/admin-request";
import { writeAudit } from "@/lib/security/audit";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerMutation(request);
    if (session.legacy) throw new Error("Ative a primeira conta individual antes de gerenciar usuários.");
    const { id } = await context.params;
    const body = await readJson<{ action?: unknown; role?: unknown }>(request, 8 * 1024);
    const action = typeof body.action === "string" ? body.action : "";
    const target = await getAdminUserById(id);
    if (!target) throw new Error("Conta não encontrada.");
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase não configurado.");

    if (action === "disable") {
      if (target.id === session.id) throw new Error("Você não pode desativar a própria conta.");
      if (target.role === "owner" && target.status === "active" && (await countActiveOwners()) <= 1) throw new Error("A loja precisa manter pelo menos uma proprietária ativa.");
      const { error } = await supabase.from("admin_users").update({ status: "disabled", session_version: target.sessionVersion + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "enable") {
      const { error } = await supabase.from("admin_users").update({ status: "active", session_version: target.sessionVersion + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "revoke_sessions") {
      const { error } = await supabase.from("admin_users").update({ session_version: target.sessionVersion + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "role") {
      const role = body.role === "owner" ? "owner" : "admin";
      if (target.role === "owner" && role === "admin" && target.status === "active" && (await countActiveOwners()) <= 1) throw new Error("A loja precisa manter pelo menos uma proprietária ativa.");
      const { error } = await supabase.from("admin_users").update({ role, session_version: target.sessionVersion + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "reset_mfa") {
      if (target.id === session.id) throw new Error("Para sua própria conta, faça a recuperação pelo login.");
      const factors = await supabase.auth.admin.mfa.listFactors({ userId: id });
      if (factors.error) throw new Error(factors.error.message);
      for (const factor of factors.data.factors || []) {
        const removed = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
        if (removed.error) throw new Error(removed.error.message);
      }
      const { error } = await supabase.from("admin_users").update({ session_version: target.sessionVersion + 1 }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      throw new Error("Ação inválida.");
    }

    await writeAudit({ request, actor: session.email, action: `admin_user.${action}`, resourceType: "admin_user", resourceId: id, metadata: { target: target.email } });
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a conta." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
