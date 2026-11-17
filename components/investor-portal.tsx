"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { InvestorFinance } from "@/components/investor-finance";

type Lot = {
  id: string;
  code: string;
  name: string;
  status: "draft" | "active" | "completed" | "cancelled";
  distribution_rule?: "round_robin_random" | "round_robin_manual" | "piece_assignment";
  total_units: number;
  sold_units: number;
  remaining_units: number;
  current_slot_number?: number | null;
  current_investor_name?: string | null;
  next_slot_number?: number | null;
  next_investor_name?: string | null;
  activated_at?: string | null;
};

type Participant = {
  lot_id: string;
  investor_id: string;
  investor_code: string;
  investor_name: string;
  purchased_units: number;
  draw_position?: number | null;
  sold_units: number;
  remaining_units: number;
  next_slot_number?: number | null;
};

type QueueItem = {
  lot_id: string;
  slot_number: number;
  slot_status: "pending" | "allocated" | "reversed";
  draw_position: number;
  investor_id: string;
  investor_code: string;
  investor_name: string;
  source_type?: "store_sale" | "online_order" | null;
  sold_at?: string | null;
};

type LotItem = {
  lot_id: string;
  variant_id: string;
  quantity: number;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_active: boolean;
  image_url?: string | null;
  sku: string;
  size: string;
  color: string;
};

type ProductCard = {
  productId: string;
  name: string;
  slug: string;
  active: boolean;
  image: string;
  quantity: number;
  sizes: string[];
  colors: string[];
};

type Dashboard = {
  investor: { id: string; code: string; name: string; email?: string | null; phone?: string | null };
  lots: Lot[];
  participants: Participant[];
  queue: QueueItem[];
  items: LotItem[];
};

function statusLabel(status: Lot["status"]) {
  if (status === "active") return "Em andamento";
  if (status === "completed") return "Concluído";
  if (status === "cancelled") return "Cancelado";
  return "Rascunho";
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function groupProducts(items: LotItem[]): ProductCard[] {
  const grouped = new Map<string, ProductCard>();

  for (const item of items) {
    const current = grouped.get(item.product_id);
    if (current) {
      current.quantity += Number(item.quantity || 0);
      current.sizes = unique([...current.sizes, item.size]);
      current.colors = unique([...current.colors, item.color]);
      continue;
    }

    grouped.set(item.product_id, {
      productId: item.product_id,
      name: item.product_name,
      slug: item.product_slug,
      active: item.product_active,
      image: item.image_url || "/products/body-vinho.svg",
      quantity: Number(item.quantity || 0),
      sizes: unique([item.size]),
      colors: unique([item.color]),
    });
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function InvestorPortal() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeArea, setActiveArea] = useState<"portfolio" | "finance">("portfolio");
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setDashboard(null);
        return;
      }
      const response = await fetch("/api/investor/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { dashboard?: Dashboard; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seu painel.");
      setDashboard(payload.dashboard || null);
      if (payload.dashboard?.lots?.length) {
        setSelectedLotId((current) => current || payload.dashboard!.lots[0].id);
      }
    } catch (problem) {
      setDashboard(null);
      setError(problem instanceof Error ? problem.message : "Erro ao carregar o portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    const { data } = supabase.auth.onAuthStateChange(() => void loadDashboard());
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setMessage("");
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw new Error("E-mail ou senha inválidos.");
      await loadDashboard();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível entrar.");
    } finally {
      setSigningIn(false);
    }
  }

  async function resetPassword() {
    setMessage("");
    setError("");
    const value = email.trim();
    if (!value) {
      setError("Digite seu e-mail primeiro.");
      return;
    }
    const redirectTo = `${window.location.origin}/investidor/redefinir-senha`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(value, { redirectTo });
    if (resetError) setError(resetError.message || "Não foi possível enviar o link.");
    else setMessage("Enviamos um link para redefinir sua senha.");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const accountEmail = String(dashboard?.investor.email || "").trim().toLowerCase();
    if (!accountEmail) {
      setError("Sua conta não possui um e-mail válido para confirmar a senha.");
      return;
    }
    if (!currentPassword) {
      setError("Digite sua senha atual.");
      return;
    }
    if (newPassword.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== repeatNewPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Escolha uma nova senha diferente da senha atual.");
      return;
    }

    setChangingPassword(true);
    try {
      const { error: confirmError } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password: currentPassword,
      });
      if (confirmError) throw new Error("A senha atual está incorreta.");

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message || "Não foi possível alterar a senha.");

      setCurrentPassword("");
      setNewPassword("");
      setRepeatNewPassword("");
      setShowPasswordText(false);
      setShowPasswordPanel(false);
      setMessage("Senha alterada com sucesso. Use a nova senha no próximo acesso.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível alterar a senha.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function sendLoggedRecovery() {
    setMessage("");
    setError("");
    const accountEmail = String(dashboard?.investor.email || "").trim().toLowerCase();
    if (!accountEmail) {
      setError("Sua conta não possui um e-mail válido para recuperação.");
      return;
    }
    const redirectTo = `${window.location.origin}/investidor/redefinir-senha`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(accountEmail, { redirectTo });
    if (resetError) setError(resetError.message || "Não foi possível enviar o link de recuperação.");
    else setMessage(`Enviamos um link de recuperação para ${accountEmail}.`);
  }

  async function logout() {
    await supabase.auth.signOut();
    setDashboard(null);
    setPassword("");
    setShowPasswordPanel(false);
  }

  if (loading && !dashboard) {
    return <main className="investor-page"><div className="investor-loading">Carregando Portal do Investidor...</div></main>;
  }

  if (!dashboard) {
    return (
      <main className="investor-page">
        <form className="investor-login" onSubmit={login}>
          <div className="investor-brand"><strong>A&amp;C</strong><span>PORTAL DO INVESTIDOR</span></div>
          <h1>Seu acesso</h1>
          <p>Entre com o e-mail cadastrado pela administração. Este acesso é separado do painel da loja.</p>
          {error && <div className="investor-alert error">{error}</div>}
          {message && <div className="investor-alert ok">{message}</div>}
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          <button className="investor-primary" disabled={signingIn}>{signingIn ? "Entrando..." : "Entrar"}</button>
          <button className="investor-link investor-recovery-button" type="button" onClick={() => void resetPassword()}>Recuperar minha senha por e-mail</button>
        </form>
        <PortalStyle />
      </main>
    );
  }

  const selectedLot = dashboard.lots.find((lot) => lot.id === selectedLotId) || dashboard.lots[0];
  const participants = selectedLot ? dashboard.participants.filter((item) => item.lot_id === selectedLot.id).sort((a,b) => (a.draw_position || 9999) - (b.draw_position || 9999)) : [];
  const queue = selectedLot ? dashboard.queue.filter((item) => item.lot_id === selectedLot.id).sort((a,b) => a.slot_number - b.slot_number) : [];
  const selectedProducts = selectedLot ? groupProducts((dashboard.items || []).filter((item) => item.lot_id === selectedLot.id)) : [];
  const myTotals = dashboard.participants.filter((item) => item.investor_id === dashboard.investor.id).reduce((acc, item) => ({ purchased: acc.purchased + Number(item.purchased_units || 0), sold: acc.sold + Number(item.sold_units || 0), remaining: acc.remaining + Number(item.remaining_units || 0) }), { purchased: 0, sold: 0, remaining: 0 });

  return (
    <main className="investor-page investor-dashboard-page">
      <header className="investor-topbar">
        <div className="investor-brand"><strong>A&amp;C</strong><span>PORTAL DO INVESTIDOR</span></div>
        <div className="investor-topbar-user"><strong>{dashboard.investor.name}</strong><span>{dashboard.investor.code}</span></div>
        <div className="investor-topbar-actions">
          <Link href="/" target="_blank">Abrir loja ↗</Link>
          <button type="button" onClick={() => { setError(""); setMessage(""); setShowPasswordPanel(true); }}>Alterar senha</button>
          <button type="button" onClick={() => void logout()}>Sair</button>
        </div>
      </header>

      <section className="investor-wrap">
        {message && <div className="investor-alert ok investor-dashboard-alert">{message}</div>}
        {error && <div className="investor-alert error investor-dashboard-alert">{error}</div>}

        {showPasswordPanel && (
          <div className="investor-security-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !changingPassword) setShowPasswordPanel(false); }}>
            <form className="investor-security-card" onSubmit={changePassword}>
              <div className="investor-security-head">
                <div><span>SEGURANÇA</span><h2>Alterar senha</h2></div>
                <button type="button" aria-label="Fechar" disabled={changingPassword} onClick={() => setShowPasswordPanel(false)}>×</button>
              </div>
              <p>Confirme sua senha atual e escolha uma nova senha com pelo menos 8 caracteres.</p>
              <div className="investor-security-note">Se esta mesma conta também tiver acesso administrativo, a nova senha passa a valer no <strong>Admin</strong> e no <strong>Portal do Investidor</strong>.</div>
              <label>Senha atual<input type={showPasswordText ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" disabled={changingPassword} required /></label>
              <label>Nova senha<input type={showPasswordText ? "text" : "password"} minLength={8} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" disabled={changingPassword} required /></label>
              <label>Repita a nova senha<input type={showPasswordText ? "text" : "password"} minLength={8} maxLength={128} value={repeatNewPassword} onChange={(e) => setRepeatNewPassword(e.target.value)} autoComplete="new-password" disabled={changingPassword} required /></label>
              <label className="investor-security-show"><input type="checkbox" checked={showPasswordText} onChange={(e) => setShowPasswordText(e.target.checked)} disabled={changingPassword} /> Mostrar senhas</label>
              <div className="investor-security-actions">
                <button className="secondary" type="button" disabled={changingPassword} onClick={() => void sendLoggedRecovery()}>Esqueci a senha atual</button>
                <button className="primary" type="submit" disabled={changingPassword}>{changingPassword ? "Alterando..." : "Salvar nova senha"}</button>
              </div>
            </form>
          </div>
        )}

        <nav className="investor-main-tabs">
          <button type="button" className={activeArea === "portfolio" ? "active" : ""} onClick={() => setActiveArea("portfolio")}>Lotes e rodízio</button>
          <button type="button" className={activeArea === "finance" ? "active" : ""} onClick={() => setActiveArea("finance")}>Meu caixa</button>
        </nav>

        {activeArea === "finance" ? (
          <InvestorFinance />
        ) : (
          <>
        <div className="investor-title"><span>ACOMPANHAMENTO</span><h1>Olá, {dashboard.investor.name}</h1><p>Acompanhe seus lotes, as roupas disponíveis e a ordem compartilhada das vendas. Clique em uma roupa para abrir a página dela na loja.</p></div>

        <div className="investor-stats">
          <article><span>Peças compradas</span><strong>{myTotals.purchased}</strong></article>
          <article><span>Vendas da sua vez</span><strong>{myTotals.sold}</strong></article>
          <article><span>Suas peças restantes</span><strong>{myTotals.remaining}</strong></article>
          <article><span>Lotes</span><strong>{dashboard.lots.length}</strong></article>
        </div>

        {!selectedLot ? (
          <section className="investor-card investor-empty"><h2>Nenhum lote ainda</h2><p>Quando você participar de um lote, as roupas e o rodízio aparecerão aqui.</p></section>
        ) : (
          <>
            <section className="investor-card">
              <div className="investor-card-head">
                <div><span>RODÍZIO AO VIVO</span><h2>{selectedLot.name}</h2><small>{selectedLot.code} · {statusLabel(selectedLot.status)}</small></div>
                <select value={selectedLot.id} onChange={(e) => setSelectedLotId(e.target.value)}>{dashboard.lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.code} — {lot.name}</option>)}</select>
              </div>

              <div className="investor-live-grid">
                {selectedLot.distribution_rule === "piece_assignment" ? (
                  <>
                    <article><span>DISTRIBUIÇÃO</span><strong>Peças definidas</strong><small>Cada roupa já possui um investidor responsável</small></article>
                    <article><span>REGRA</span><strong>Sem fila geral</strong><small>A venda segue o dono definido da peça</small></article>
                  </>
                ) : (
                  <>
                    <article><span>VEZ ATUAL</span><strong>{selectedLot.current_investor_name || "Concluído"}</strong><small>{selectedLot.current_slot_number ? `Posição ${selectedLot.current_slot_number}` : statusLabel(selectedLot.status)}</small></article>
                    <article><span>PRÓXIMO</span><strong>{selectedLot.next_investor_name || "—"}</strong><small>{selectedLot.next_slot_number ? `Posição ${selectedLot.next_slot_number}` : "Sem próxima posição"}</small></article>
                  </>
                )}
                <article><span>PROGRESSO</span><strong>{Number(selectedLot.sold_units || 0)}/{Number(selectedLot.total_units || 0)}</strong><small>{Number(selectedLot.remaining_units || 0)} restante(s)</small></article>
              </div>
              <div className="investor-progress"><i style={{ width: `${selectedLot.total_units ? Math.min(100, Math.round((Number(selectedLot.sold_units || 0) / Number(selectedLot.total_units || 1)) * 100)) : 0}%` }} /></div>
              <small className="investor-date">Ativado em {shortDate(selectedLot.activated_at)}</small>
            </section>

            <section className="investor-card investor-products-section">
              <div className="investor-card-head">
                <div><span>ROUPAS DO SEU LOTE</span><h2>Veja as peças na loja</h2><small>Estas são as roupas do lote do qual você participa. Toque ou clique para abrir o produto.</small></div>
              </div>

              {selectedProducts.length ? (
                <div className="investor-product-grid">
                  {selectedProducts.map((product) => {
                    const content = (
                      <>
                        <div className="investor-product-image">
                          <Image src={product.image} alt={product.name} width={420} height={525} sizes="(max-width: 600px) 100vw, 260px" />
                          {product.active && <span>Ver na loja ↗</span>}
                        </div>
                        <div className="investor-product-info">
                          <span>ROUPA DO LOTE</span>
                          <h3>{product.name}</h3>
                          <p><strong>{product.quantity}</strong> peça(s) deste modelo no lote</p>
                          <small>{product.sizes.length ? `Tamanho(s): ${product.sizes.join(", ")}` : ""}{product.sizes.length && product.colors.length ? " · " : ""}{product.colors.length ? `Cor(es): ${product.colors.join(", ")}` : ""}</small>
                          <b>{product.active ? "Abrir página do produto" : "Produto não publicado na loja"}</b>
                        </div>
                      </>
                    );

                    return product.active && product.slug ? (
                      <Link className="investor-product-card" href={`/produto/${product.slug}`} target="_blank" rel="noreferrer" key={product.productId}>
                        {content}
                      </Link>
                    ) : (
                      <article className="investor-product-card disabled" key={product.productId}>{content}</article>
                    );
                  })}
                </div>
              ) : (
                <div className="investor-products-empty">As fotos das roupas deste lote aparecerão aqui quando os produtos estiverem vinculados.</div>
              )}
            </section>

            <section className="investor-card">
              <div className="investor-card-head"><div><span>PARTICIPANTES</span><h2>Resumo do lote</h2></div></div>
              <div className="investor-table">
                <div className="investor-table-row header"><span>Ordem</span><span>Investidor</span><span>Compradas</span><span>Vendidas</span><span>Restantes</span></div>
                {participants.map((item) => (
                  <div className={`investor-table-row ${item.investor_id === dashboard.investor.id ? "mine" : ""}`} key={`${item.lot_id}-${item.investor_id}`}>
                    <span>#{item.draw_position || "—"}</span><strong>{item.investor_name}{item.investor_id === dashboard.investor.id ? " (você)" : ""}</strong><span>{item.purchased_units}</span><span>{item.sold_units}</span><span>{item.remaining_units}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="investor-card">
              {selectedLot.distribution_rule === "piece_assignment" ? (
                <>
                  <div className="investor-card-head"><div><span>DISTRIBUIÇÃO DEFINIDA</span><h2>Cada peça já tem seu investidor</h2><small>Neste lote não existe uma fila geral. Quando uma unidade é vendida, a venda segue o investidor previamente vinculado àquela peça.</small></div></div>
                  <div className="investor-products-empty">A distribuição fica travada depois da ativação para preservar o histórico das vendas.</div>
                </>
              ) : (
                <>
                  <div className="investor-card-head"><div><span>FILA COMPLETA</span><h2>Sequência do rodízio</h2></div></div>
                  <div className="investor-queue">
                    {queue.map((item) => (
                      <div className={`${item.investor_id === dashboard.investor.id ? "mine" : ""} ${item.slot_status}`} key={`${item.lot_id}-${item.slot_number}`}>
                        <b>#{item.slot_number}</b><span>{item.investor_name}</span><small>{item.slot_status === "pending" ? "Aguardando" : item.slot_status === "allocated" ? "Vendido" : "Estornado"}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
          </>
        )}
      </section>
      <PortalStyle />
    </main>
  );
}

function PortalStyle() {
  return <style jsx global>{`
    .investor-page{min-height:100vh;background:#f4f1ec;color:#171717;font-family:Arial,Helvetica,sans-serif;padding:28px;box-sizing:border-box}.investor-login{width:min(440px,100%);margin:7vh auto;background:#fff;border:1px solid #ded9d1;padding:34px;display:grid;gap:17px;box-shadow:0 20px 60px rgba(0,0,0,.08)}.investor-brand{display:flex;align-items:baseline;gap:9px}.investor-brand strong{font:700 34px Georgia,serif}.investor-brand span{font-size:8px;letter-spacing:.25em}.investor-login h1,.investor-title h1{font:500 42px Georgia,serif;margin:0}.investor-login p,.investor-title p{color:#6d6861;line-height:1.6;margin:0}.investor-login label{display:grid;gap:7px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.investor-login input{padding:13px;border:1px solid #d9d3ca;font-size:14px}.investor-primary{border:0;background:#111;color:#fff;padding:14px;font-weight:700}.investor-link{border:0;background:transparent;text-decoration:underline;padding:6px}.investor-alert{padding:11px 12px;font-size:12px}.investor-alert.error{background:#fff0f0;color:#9a2525}.investor-alert.ok{background:#edf8ef;color:#246336}.investor-loading{max-width:520px;margin:15vh auto;text-align:center;background:#fff;padding:30px;border:1px solid #ddd}.investor-dashboard-page{padding:0}.investor-topbar{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:20px;background:#111;color:#fff;padding:16px 28px}.investor-topbar-user{display:grid;text-align:right;gap:3px}.investor-topbar-user span{font-size:10px;color:#aaa}.investor-topbar-actions{display:flex;align-items:center;gap:8px}.investor-topbar-actions a,.investor-topbar-actions button{background:transparent;color:#fff;border:1px solid #444;padding:9px 12px;font-size:11px;text-decoration:none}.investor-topbar-actions a:hover,.investor-topbar-actions button:hover{background:#fff;color:#111}.investor-wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:38px 0 70px;display:grid;gap:20px}.investor-main-tabs{display:flex;gap:8px}.investor-main-tabs button{border:1px solid #d8d1c9;background:#fff;padding:11px 16px;font-size:11px;font-weight:800}.investor-main-tabs button.active{background:#111;color:#fff;border-color:#111}.investor-title{display:grid;gap:8px}.investor-title>span,.investor-card-head span{font-size:9px;font-weight:900;letter-spacing:.14em;color:#8a7567}.investor-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.investor-stats article{background:#fff;border:1px solid #e0dbd4;padding:18px;display:grid;gap:6px}.investor-stats span{font-size:10px;color:#777}.investor-stats strong{font:600 31px Georgia,serif}.investor-card{background:#fff;border:1px solid #e0dbd4;padding:24px;display:grid;gap:20px}.investor-card-head{display:flex;justify-content:space-between;align-items:center;gap:15px}.investor-card-head h2{font:500 27px Georgia,serif;margin:5px 0}.investor-card-head small{color:#777}.investor-card-head select{padding:10px;border:1px solid #d7d1c8;max-width:360px}.investor-live-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.investor-live-grid article{background:#f8f6f3;border:1px solid #e8e2da;padding:18px;display:grid;gap:7px}.investor-live-grid span{font-size:9px;letter-spacing:.1em;color:#7a6b60}.investor-live-grid strong{font:600 24px Georgia,serif}.investor-live-grid small{color:#777}.investor-progress{height:9px;background:#eee9e3;overflow:hidden}.investor-progress i{display:block;height:100%;background:#111}.investor-date{color:#777}.investor-products-section{overflow:hidden}.investor-product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:15px}.investor-product-card{display:grid;grid-template-rows:auto 1fr;border:1px solid #e2d9cf;background:#fbf9f6;color:#171717;text-decoration:none;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.investor-product-card:not(.disabled):hover{transform:translateY(-3px);box-shadow:0 14px 34px rgba(47,35,25,.12);border-color:#bda68f}.investor-product-card.disabled{opacity:.72}.investor-product-image{position:relative;aspect-ratio:4/5;background:#eee8e1;overflow:hidden}.investor-product-image img{width:100%;height:100%;object-fit:cover;transition:transform .25s ease}.investor-product-card:not(.disabled):hover .investor-product-image img{transform:scale(1.025)}.investor-product-image>span{position:absolute;right:10px;bottom:10px;background:rgba(17,17,17,.88);color:#fff;padding:8px 10px;font-size:9px;font-weight:800;letter-spacing:.05em}.investor-product-info{padding:15px;display:grid;gap:7px}.investor-product-info>span{font-size:8px;font-weight:900;letter-spacing:.13em;color:#9a795f}.investor-product-info h3{font:600 21px Georgia,serif;margin:0}.investor-product-info p{margin:0;font-size:11px;color:#5f5953}.investor-product-info p strong{font-size:14px;color:#171717}.investor-product-info small{color:#777;line-height:1.5;min-height:30px}.investor-product-info b{margin-top:4px;font-size:10px;text-decoration:underline}.investor-products-empty{background:#f8f5f1;border:1px dashed #d7cabd;padding:22px;color:#746a61;font-size:12px;text-align:center}.investor-table{overflow-x:auto}.investor-table-row{min-width:700px;display:grid;grid-template-columns:90px minmax(200px,1fr) repeat(3,110px);gap:12px;align-items:center;padding:12px;border-bottom:1px solid #eee;font-size:12px}.investor-table-row.header{font-size:9px;font-weight:800;text-transform:uppercase;color:#777}.investor-table-row.mine{background:#f2eee8}.investor-queue{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px}.investor-queue>div{border:1px solid #e4ded6;padding:11px;display:grid;gap:5px}.investor-queue>div.mine{border-color:#111;background:#f4f0ea}.investor-queue>div.allocated{opacity:.58}.investor-queue>div.reversed{text-decoration:line-through;opacity:.48}.investor-queue small{font-size:9px;color:#777}.investor-empty{text-align:center;padding:45px}.investor-empty h2{font:500 30px Georgia,serif;margin:0}.investor-empty p{color:#777}.investor-dashboard-alert{margin:0}.investor-recovery-button{font-weight:700;color:#4b4037}.investor-security-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px}.investor-security-card{width:min(500px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #d9d0c6;box-shadow:0 24px 80px rgba(0,0,0,.28);padding:26px;display:grid;gap:15px}.investor-security-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.investor-security-head span{font-size:9px;font-weight:900;letter-spacing:.14em;color:#8a7567}.investor-security-head h2{font:500 31px Georgia,serif;margin:5px 0 0}.investor-security-head>button{border:0;background:transparent;font-size:28px;line-height:1;padding:0 4px;cursor:pointer}.investor-security-card>p{margin:0;color:#6d6861;line-height:1.55;font-size:13px}.investor-security-note{background:#f6f1ea;border:1px solid #e5d8ca;padding:12px;color:#62584f;font-size:12px;line-height:1.55}.investor-security-card>label:not(.investor-security-show){display:grid;gap:7px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.investor-security-card input[type=password],.investor-security-card input[type=text]{padding:13px;border:1px solid #d9d3ca;font-size:14px}.investor-security-show{display:flex;align-items:center;gap:8px;font-size:12px;color:#5f5953}.investor-security-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}.investor-security-actions button{padding:11px 14px;font-weight:800;font-size:11px}.investor-security-actions .secondary{background:#fff;border:1px solid #cfc5ba;color:#222}.investor-security-actions .primary{background:#111;border:1px solid #111;color:#fff}@media(max-width:800px){.investor-page{padding:14px}.investor-topbar{grid-template-columns:1fr auto;padding:14px}.investor-topbar-user{grid-row:2;grid-column:1/-1;text-align:left}.investor-topbar-actions{justify-self:end}.investor-stats{grid-template-columns:1fr 1fr}.investor-live-grid{grid-template-columns:1fr}.investor-card-head{align-items:flex-start;flex-direction:column}.investor-card-head select{width:100%;max-width:none}.investor-wrap{width:min(100% - 20px,1180px);padding-top:24px}.investor-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.investor-product-grid{grid-template-columns:1fr}.investor-topbar-actions a{display:none}}@media(max-width:480px){.investor-stats{grid-template-columns:1fr}.investor-login{padding:24px}.investor-login h1,.investor-title h1{font-size:34px}}
  `}</style>;
}
