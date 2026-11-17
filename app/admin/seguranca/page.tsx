import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getSecurityChecks } from "@/lib/security/env";
import { recentAuditLogs } from "@/lib/security/audit";
import { listAdminUsers } from "@/lib/admin-users";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function accountSecurity() {
  const users = await listAdminUsers();
  const active = users.filter((user) => user.status === "active");
  const supabase = getSupabaseAdmin();
  let protectedCount = 0;
  if (supabase) {
    for (const user of active) {
      const factors = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
      if (!factors.error && factors.data.factors?.some((factor) => factor.status === "verified")) protectedCount += 1;
    }
  }
  return { users, active, protectedCount };
}

export default async function SecurityPage() {
  const session = await requireAdminPage();
  const [checks, logs, accounts] = await Promise.all([Promise.resolve(getSecurityChecks()), recentAuditLogs(40), accountSecurity()]);
  const required = checks.filter((item) => item.level === "required");
  const baseScore = required.filter((item) => item.ok).length;
  const accountRequirement = accounts.active.length > 0 && accounts.protectedCount === accounts.active.length;
  const score = Math.round(((baseScore + (accountRequirement ? 1 : 0)) / Math.max(1, required.length + 1)) * 100);
  return (
    <AdminShell active="security">
      <div className="admin-heading">
        <div><span className="eyebrow">PROTEÇÃO</span><h1>Segurança da loja</h1><p>Verificação das configurações essenciais, contas individuais e histórico administrativo.</p></div>
        <div className={`security-score ${score === 100 ? "ok" : "warning"}`}><strong>{score}%</strong><span>itens obrigatórios</span></div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-title"><div><h2>Checklist de segurança</h2><span>Todos os itens obrigatórios devem ficar verdes antes da publicação.</span></div></div>
        <div className="security-check-grid">
          {checks.map((check) => <div key={check.id} className={`security-check ${check.ok ? "ok" : "warning"}`}><b>{check.ok ? "✓" : "!"}</b><div><strong>{check.label}</strong><small>{check.detail}</small><em>{check.level === "required" ? "Obrigatório" : "Recomendado"}</em></div></div>)}
          <div className={`security-check ${accountRequirement ? "ok" : "warning"}`}><b>{accountRequirement ? "✓" : "!"}</b><div><strong>Contas com autenticação em duas etapas</strong><small>{accounts.active.length ? `${accounts.protectedCount} de ${accounts.active.length} conta(s) ativa(s) possuem autenticador verificado.` : "Crie a primeira conta individual em Contas e acessos."}</small><em>Obrigatório</em></div></div>
        </div>
        {session.role === "owner" && <div className="security-panel-action"><Link className="button button-outline" href="/admin/usuarios">Gerenciar contas e acessos</Link></div>}
      </div>

      <div className="admin-panel">
        <div className="admin-panel-title"><div><h2>Atividade administrativa</h2><span>Os registros identificam a conta responsável, sem guardar senhas, tokens, documentos ou chaves.</span></div></div>
        {logs.length ? <div className="security-log-list">{logs.map((log: Record<string, unknown>) => <div key={String(log.id)}><span className={log.outcome === "failure" ? "failure" : "success"}>{log.outcome === "failure" ? "FALHA" : "OK"}</span><strong>{String(log.action)}<small className="audit-actor">{log.actor ? ` por ${String(log.actor)}` : ""}</small></strong><small>{new Date(String(log.created_at)).toLocaleString("pt-BR")}{log.resource_id ? ` • ${String(log.resource_id).slice(0, 18)}` : ""}</small></div>)}</div> : <div className="admin-empty"><h3>Sem registros ainda</h3><p>Execute a migração da Fase 8.1 e faça login novamente.</p></div>}
      </div>
    </AdminShell>
  );
}
