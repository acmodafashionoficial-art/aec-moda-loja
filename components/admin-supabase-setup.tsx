"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseSetupStatus } from "@/lib/supabase/status";

export function AdminSupabaseSetup({ status }: { status: SupabaseSetupStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const ready = status.configured && status.connected && ["products", "product_variants", "orders", "store_settings", "order_events", "order_reservations"].every((table) => status.tables[table]);

  async function migrate() {
    if (!window.confirm("Migrar produtos, fotos e configurações locais para o Supabase? Dados com o mesmo ID serão atualizados.")) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/supabase/migrate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na migração.");
      setMessage(`Migração concluída: ${data.result.products} produtos e ${data.result.images} imagens.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally { setLoading(false); }
  }

  return <div className="supabase-setup-grid">
    <section className="admin-form-card">
      <h2>1. Variáveis de ambiente</h2>
      <div className={`setup-status ${status.configured ? "ok" : "pending"}`}><b>{status.configured ? "Configuradas" : "Pendentes"}</b><span>NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (ou SERVICE_ROLE)</span></div>
      {status.url && <p className="admin-field-note">Projeto: {status.url.replace(/^https?:\/\//, "").split(".")[0]}</p>}
    </section>
    <section className="admin-form-card">
      <h2>2. Banco de dados</h2>
      <div className="setup-check-list">{Object.entries(status.tables).map(([name, ok]) => <span className={ok ? "ok" : "pending"} key={name}>{ok ? "✓" : "!"} {name}</span>)}</div>
      <p className="admin-field-note">Execute o schema completo e, nesta versão, também o arquivo <b>MIGRACAO-FASE-7.sql</b> no SQL Editor do Supabase.</p>
    </section>
    <section className="admin-form-card">
      <h2>3. Imagens</h2>
      <div className="setup-check-list"><span className={status.buckets["product-images"] ? "ok" : "pending"}>{status.buckets["product-images"] ? "✓" : "!"} product-images</span><span className={status.buckets["brand-assets"] ? "ok" : "pending"}>{status.buckets["brand-assets"] ? "✓" : "!"} brand-assets</span></div>
      <p className="admin-field-note">Os buckets serão criados automaticamente durante a migração.</p>
    </section>
    <section className="admin-form-card setup-migration-card">
      <h2>4. Migrar dados atuais</h2>
      <p>Envia produtos, fotos, logo, personalização, logística e fretes deste computador para a nuvem.</p>
      {message && <p className={message.includes("concluída") ? "success-text" : "form-error"}>{message}</p>}
      <button className="button button-dark" disabled={!ready || loading} onClick={migrate}>{loading ? "Migrando…" : "Migrar dados para o Supabase"}</button>
      {!ready && <small>O botão será liberado depois que as variáveis e tabelas estiverem corretas.</small>}
    </section>
  </div>;
}
