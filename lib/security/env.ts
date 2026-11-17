import "server-only";

import { usingSupabase } from "@/lib/product-repository";

function value(name: string) { return String(process.env[name] || "").trim(); }
function strongSecret(name: string) { return value(name).length >= 48; }

export type SecurityCheck = { id: string; label: string; ok: boolean; level: "required" | "recommended"; detail: string };

export function getSecurityChecks(): SecurityCheck[] {
  const production = process.env.NODE_ENV === "production";
  const siteUrl = value("NEXT_PUBLIC_SITE_URL");
  const passwordHash = value("ADMIN_PASSWORD_HASH");
  const plainPassword = value("ADMIN_PASSWORD");
  return [
    { id: "session", label: "Chave da sessão", ok: strongSecret("ADMIN_SESSION_SECRET"), level: "required", detail: "Use uma chave aleatória com pelo menos 48 caracteres." },
    { id: "rate", label: "Proteção de limites", ok: strongSecret("RATE_LIMIT_PEPPER") || strongSecret("ADMIN_SESSION_SECRET"), level: "required", detail: "Protege os identificadores usados no bloqueio de abuso." },
    { id: "password", label: "Senha administrativa protegida", ok: Boolean(passwordHash) || (!production && plainPassword.length >= 12), level: "required", detail: passwordHash ? "Hash PBKDF2 configurado." : "Em produção, use ADMIN_PASSWORD_HASH em vez da senha em texto." },
    { id: "supabase", label: "Banco seguro conectado", ok: usingSupabase(), level: "required", detail: "Produtos, pedidos, auditoria e bloqueios persistentes devem usar o Supabase." },
    { id: "auth", label: "Contas individuais", ok: Boolean(value("NEXT_PUBLIC_SUPABASE_URL") && value("NEXT_PUBLIC_SUPABASE_ANON_KEY") && (value("SUPABASE_SECRET_KEY") || value("SUPABASE_SERVICE_ROLE_KEY"))), level: "required", detail: "URL, chave pública e chave secreta do Supabase Auth devem estar configuradas." },
    { id: "https", label: "HTTPS", ok: !production || /^https:\/\//i.test(siteUrl), level: "required", detail: "Obrigatório quando a loja for publicada." },
    { id: "demo", label: "Checkout demonstrativo bloqueado", ok: value("ALLOW_DEMO_CHECKOUT") !== "true", level: "required", detail: "Vendas reais não podem aceitar fluxo demonstrativo." },
    { id: "integration", label: "Criptografia de integrações", ok: strongSecret("INTEGRATION_ENCRYPTION_KEY"), level: "required", detail: "Protege tokens salvos no banco." },
    { id: "webhook", label: "Webhook do Melhor Envio", ok: !value("MELHOR_ENVIO_CLIENT_ID") || Boolean(value("MELHOR_ENVIO_WEBHOOK_SECRET") || value("MELHOR_ENVIO_CLIENT_SECRET")), level: "recommended", detail: "Use um segredo dedicado quando o webhook estiver ativo." },
  ];
}

export function assertProductionSecurity() {
  if (process.env.NODE_ENV !== "production") return;
  const failed = getSecurityChecks().filter((check) => check.level === "required" && !check.ok);
  if (failed.length) throw new Error(`Configuração insegura para produção: ${failed.map((item) => item.label).join(", ")}.`);
}
