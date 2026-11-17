"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentSettings } from "@/lib/payment-settings";

export function AdminPaymentForm({ initialSettings, siteUrl }: { initialSettings: PaymentSettings; siteUrl: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const webhookReady = /^https:\/\//i.test(siteUrl);

  function update<K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setSettings(data.settings);
      setMessage("Pagamento atualizado. O checkout já usará a InfinitePay.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-settings-form" onSubmit={submit}>
      <div className="admin-form-main">
        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>1</span><div><h2>Habilitar na InfinitePay</h2><p>Na conta da loja, abra Vendas → Checkout → Configurações e habilite o Checkout Integrado.</p></div></div>
          <div className="payment-guide-list">
            <div><b>1</b><span>Abra o aplicativo ou a conta web da InfinitePay.</span></div>
            <div><b>2</b><span>Entre em <strong>Vendas → Checkout → Configurações</strong>.</span></div>
            <div><b>3</b><span>Toque em <strong>Habilitar Checkout Integrado</strong>.</span></div>
            <div><b>4</b><span>Copie sua InfiniteTag, sem o símbolo <strong>$</strong>.</span></div>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>2</span><div><h2>Configuração da A&C Moda</h2><p>A InfiniteTag identifica a conta que receberá as vendas.</p></div></div>
          <div className="admin-form-grid two">
            <label className="span-two">InfiniteTag da loja
              <div className="input-prefix"><span>$</span><input value={settings.infinitePayHandle} onChange={(event) => update("infinitePayHandle", event.target.value.replace(/^\$+/, ""))} placeholder="exemplo: acmodafashion" autoComplete="off" /></div>
              <small>Não é senha nem token. Use a identificação que aparece no canto superior do app.</small>
            </label>
            <label>Nome mostrado no painel<input value={settings.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
            <label>Parcelamento informado ao cliente<select value={settings.maxInstallments} onChange={(event) => update("maxInstallments", Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Até {value}x</option>)}</select></label>
          </div>
          <div className="admin-switch-stack">
            <label className="admin-switch"><input type="checkbox" checked={settings.showPix} onChange={(event) => update("showPix", event.target.checked)} /><span><b>Informar Pix no checkout</b><small>A disponibilidade final é exibida pela InfinitePay.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.showCreditCard} onChange={(event) => update("showCreditCard", event.target.checked)} /><span><b>Informar cartão de crédito</b><small>O cliente escolhe as parcelas dentro do checkout seguro.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.checkoutEnabled} onChange={(event) => update("checkoutEnabled", event.target.checked)} /><span><b>Ativar vendas pela InfinitePay</b><small>Ative somente depois de habilitar o Checkout Integrado na conta.</small></span></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>3</span><div><h2>Confirmação segura</h2><p>O site nunca confia apenas no retorno do navegador.</p></div></div>
          <div className="content-cards three payment-security-cards">
            <section><h3>Pedido protegido</h3><p>Preço, estoque, frete e total são recalculados no servidor.</p></section>
            <section><h3>Pagamento verificado</h3><p>O site consulta a API da InfinitePay antes de aprovar o pedido.</p></section>
            <section><h3>Estoque idempotente</h3><p>A confirmação repetida não baixa o estoque duas vezes.</p></section>
          </div>
          {!webhookReady && <div className="admin-mode-banner warning"><strong>Teste local</strong><span>Em localhost, a InfinitePay não consegue chamar o webhook. O pagamento ainda é verificado quando o cliente volta para a loja. Depois da publicação em HTTPS, o webhook será ativado automaticamente.</span></div>}
          {webhookReady && <div className="upload-success">✓ Webhook preparado em {siteUrl}/api/webhooks/infinitepay</div>}
        </section>
      </div>

      <aside className="admin-form-side">
        <div className="admin-form-card sticky-card">
          <h2>Resumo</h2>
          <div className="publish-summary">
            <span>Provedor <b>InfinitePay</b></span>
            <span>InfiniteTag <b>{settings.infinitePayHandle ? `$${settings.infinitePayHandle}` : "Pendente"}</b></span>
            <span>Checkout <b>{settings.checkoutEnabled ? "Ativo" : "Desativado"}</b></span>
            <span>Webhook <b>{webhookReady ? "Pronto" : "Após publicar"}</b></span>
          </div>
          {message && <div className="upload-success">✓ {message}</div>}
          {error && <div className="form-error">{error}</div>}
          <button className="button button-dark button-full" disabled={saving}>{saving ? "Salvando…" : "Salvar pagamentos"}</button>
        </div>
      </aside>
    </form>
  );
}
