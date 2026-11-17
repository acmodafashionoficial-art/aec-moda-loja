"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/currency";

type ShippingSort = "recommended" | "price" | "time";
type ShippingSettings = {
  enabled: boolean;
  environment: "sandbox" | "production";
  includeCorreios: boolean;
  includePrivateCarriers: boolean;
  enabledServiceIds: string[];
  disabledServiceIds: string[];
  maxOptions: number;
  sortBy: ShippingSort;
  preparationDays: number;
  packagingFee: number;
  priceAdjustmentPercent: number;
  showCheapestBadge: boolean;
  showFastestBadge: boolean;
  quoteValidityMinutes: number;
  insuranceEnabled: boolean;
  receiptEnabled: boolean;
  ownHandEnabled: boolean;
  collectEnabled: boolean;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  senderDocument: string;
  senderCompanyDocument: string;
  senderStateRegister: string;
  senderAddress: string;
  senderNumber: string;
  senderComplement: string;
  senderDistrict: string;
  senderCity: string;
  senderState: string;
  senderPostalCode: string;
};

type Connection = {
  connected: boolean;
  source: "environment" | "oauth" | "none";
  environment: "sandbox" | "production";
  expiresAt?: string;
  needsReconnect: boolean;
  clientConfigured: boolean;
  callbackUrl: string;
  message: string;
};

type Service = { id: string; name: string; company: string; companyId: string; picture?: string; isCorreios: boolean };
type Quote = { id: string; name: string; company: string; price: number; providerPrice: number; packagingFee: number; deliveryLabel: string; badges: string[]; warning?: string };
type RejectedService = { serviceId: string; name: string; company: string; error: string; attempt: "volumes" | "volumes-explicit" | "products" };

function digits(value: string, max = 14) { return value.replace(/\D/g, "").slice(0, max); }
function formatCep(value: string) { const valueDigits = digits(value, 8); return valueDigits.length > 5 ? `${valueDigits.slice(0, 5)}-${valueDigits.slice(5)}` : valueDigits; }

export function AdminShippingForm({ initialSettings, initialConnection, notice }: { initialSettings: ShippingSettings; initialConnection: Connection; notice?: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [connection, setConnection] = useState(initialConnection);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState(notice || "");
  const [error, setError] = useState("");
  const [testCep, setTestCep] = useState("");
  const [testing, setTesting] = useState(false);
  const [testProduct, setTestProduct] = useState("");
  const [testQuotes, setTestQuotes] = useState<Quote[]>([]);
  const [testRejectedServices, setTestRejectedServices] = useState<RejectedService[]>([]);
  const [testPackageSummary, setTestPackageSummary] = useState("");

  function update<K extends keyof ShippingSettings>(key: K, value: ShippingSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const visibleServices = useMemo(() => services.filter((service) => service.isCorreios ? settings.includeCorreios : settings.includePrivateCarriers), [services, settings.includeCorreios, settings.includePrivateCarriers]);

  async function loadServices() {
    if (!connection.connected) return;
    setLoadingServices(true);
    setError("");
    try {
      const response = await fetch("/api/admin/shipping/services", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os serviços.");
      setServices(data.services || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os serviços.");
    } finally {
      setLoadingServices(false);
    }
  }

  function toggleService(service: Service, enabled: boolean) {
    if (service.isCorreios) {
      setSettings((current) => ({
        ...current,
        enabledServiceIds: enabled
          ? Array.from(new Set([...current.enabledServiceIds, service.id]))
          : current.enabledServiceIds.filter((id) => id !== service.id),
      }));
    }
    setSettings((current) => ({
      ...current,
      disabledServiceIds: enabled
        ? current.disabledServiceIds.filter((id) => id !== service.id)
        : Array.from(new Set([...current.disabledServiceIds, service.id])),
    }));
  }

  function isServiceEnabled(service: Service) {
    if (settings.disabledServiceIds.includes(service.id)) return false;
    if (service.isCorreios) return settings.enabledServiceIds.includes(service.id);
    return true;
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setSettings(data.settings);
      setConnection(data.connection);
      setTestQuotes([]);
      setTestRejectedServices([]);
      setTestPackageSummary("");
      setMessage(data.connection.environment !== settings.environment
        ? "Configurações salvas. Reconecte a conta no ambiente escolhido."
        : "Fretes salvos. O checkout já usa essas regras.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    setError("");
    if (!connection.clientConfigured) {
      setError("Configure MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET e a URL de retorno no arquivo .env.local.");
      return;
    }
    await save();
    window.location.href = "/api/admin/melhor-envio/connect";
  }

  async function disconnect() {
    if (!window.confirm("Desconectar a conta do Melhor Envio deste site?")) return;
    setDisconnecting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/melhor-envio/disconnect", { method: "POST", redirect: "manual" });
      if (!response.ok && response.type !== "opaqueredirect") throw new Error("Não foi possível desconectar.");
      window.location.href = "/admin/fretes?disconnected=1";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível desconectar.");
      setDisconnecting(false);
    }
  }

  async function testShipping() {
    const postalCode = digits(testCep, 8);
    if (postalCode.length !== 8) { setError("Informe um CEP válido para o teste."); return; }
    setTesting(true);
    setError("");
    setTestQuotes([]);
    setTestRejectedServices([]);
    setTestPackageSummary("");
    try {
      const response = await fetch("/api/admin/shipping/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postalCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível testar.");
      setTestProduct(data.product || "Produto de teste");
      setTestQuotes(data.quotes || []);
      setTestRejectedServices(data.rejectedServices || []);
      setTestPackageSummary(data.packageSummary || "");
      setMessage("Cotação real consultada com sucesso.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível testar.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="admin-shipping-form" onSubmit={save}>
      <div className="admin-form-main">
        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>1</span><div><h2>Conexão segura</h2><p>O checkout só libera entrega quando recebe uma cotação real.</p></div></div>
          <div className={`integration-status ${connection.connected ? "connected" : "disconnected"}`}>
            <div className="integration-status-icon">{connection.connected ? "✓" : "!"}</div>
            <div><strong>{connection.connected ? "Melhor Envio conectado" : "Melhor Envio não conectado"}</strong><span>{connection.message}</span>{connection.expiresAt && <small>Autorização atual válida até {new Date(connection.expiresAt).toLocaleString("pt-BR")}.</small>}</div>
            <div className="integration-actions">
              <button type="button" className="button button-dark" onClick={connect}>{connection.connected ? "Reconectar" : "Conectar conta"}</button>
              {connection.connected && connection.source === "oauth" && <button type="button" className="admin-text-button danger" disabled={disconnecting} onClick={disconnect}>{disconnecting ? "Desconectando…" : "Desconectar"}</button>}
            </div>
          </div>
          <div className="admin-form-grid two">
            <label>Ambiente<select value={settings.environment} onChange={(event) => update("environment", event.target.value as "sandbox" | "production")}><option value="sandbox">Testes — Sandbox</option><option value="production">Loja real — Produção</option></select><small>Teste primeiro no Sandbox; só depois mude para Produção.</small></label>
            <label>Validade da cotação (minutos)<input type="number" min="5" max="60" value={settings.quoteValidityMinutes} onChange={(event) => update("quoteValidityMinutes", Number(event.target.value))} /></label>
            <label className="span-two">URL de retorno do aplicativo<input readOnly value={connection.callbackUrl} onFocus={(event) => event.currentTarget.select()} /><small>Cadastre exatamente este endereço no aplicativo criado no Melhor Envio.</small></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>2</span><div><h2>Correios e transportadoras</h2><p>Comece com PAC, SEDEX e retirada na loja; ative outras opções quando forem vantajosas.</p></div></div>
          <div className="shipping-master-switches">
            <label className="admin-switch"><input type="checkbox" checked={settings.enabled} onChange={(event) => update("enabled", event.target.checked)} /><span><b>Entrega em domicílio ativa</b><small>Desativada, apenas a retirada na loja continuará disponível.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.includeCorreios} onChange={(event) => update("includeCorreios", event.target.checked)} /><span><b>Exibir Correios</b><small>PAC, SEDEX e outros serviços liberados na conta.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.includePrivateCarriers} onChange={(event) => update("includePrivateCarriers", event.target.checked)} /><span><b>Exibir transportadoras privadas</b><small>Jadlog, Loggi, Azul Cargo e outras quando disponíveis para o CEP.</small></span></label>
          </div>
          <div className="admin-form-grid three">
            <label>Ordenar opções<select value={settings.sortBy} onChange={(event) => update("sortBy", event.target.value as ShippingSort)}><option value="recommended">Recomendadas</option><option value="price">Menor preço</option><option value="time">Menor prazo</option></select></label>
            <label>Máximo exibido<input type="number" min="1" max="10" value={settings.maxOptions} onChange={(event) => update("maxOptions", Number(event.target.value))} /></label>
            <label>Dias para preparar o pedido<input type="number" min="0" max="20" value={settings.preparationDays} onChange={(event) => update("preparationDays", Number(event.target.value))} /></label>
          </div>
          <div className="service-toolbar"><strong>Serviços disponíveis na sua conta</strong><button type="button" className="admin-helper-button" disabled={!connection.connected || loadingServices} onClick={loadServices}>{loadingServices ? "Consultando…" : services.length ? "Atualizar lista" : "Carregar serviços"}</button></div>
          {!connection.connected && <p className="admin-field-note">Conecte a conta para visualizar os serviços realmente disponíveis.</p>}
          {connection.connected && !visibleServices.length && !loadingServices && <p className="admin-field-note">Clique em “Carregar serviços”.</p>}
          <div className="shipping-service-list">
            {visibleServices.map((service) => <label className="shipping-service-row" key={service.id}><input type="checkbox" checked={isServiceEnabled(service)} onChange={(event) => toggleService(service, event.target.checked)} /><span><b>{service.company} — {service.name}</b><small>ID {service.id}{service.isCorreios ? " • Correios" : " • Transportadora privada"}</small></span></label>)}
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>3</span><div><h2>Preço, prazo e proteção</h2><p>O valor base vem da transportadora; aqui você define custos operacionais claros.</p></div></div>
          <div className="admin-form-grid three">
            <label>Taxa fixa de embalagem (R$)<input type="number" min="0" max="100" step="0.01" value={settings.packagingFee} onChange={(event) => update("packagingFee", Number(event.target.value))} /><small>Use somente para cobrir embalagem e operação.</small></label>
            <label>Ajuste sobre o frete (%)<input type="number" min="0" max="30" step="0.1" value={settings.priceAdjustmentPercent} onChange={(event) => update("priceAdjustmentPercent", Number(event.target.value))} /><small>Recomendado: 0%. Use apenas com justificativa.</small></label>
            <label>Prazo de preparação<input disabled value={`${settings.preparationDays} dia(s) útil(eis)`} /></label>
          </div>
          <div className="admin-form-grid two compact-switch-grid">
            <label className="admin-switch"><input type="checkbox" checked={settings.insuranceEnabled} onChange={(event) => update("insuranceEnabled", event.target.checked)} /><span><b>Declarar valor dos produtos</b><small>Protege o envio de acordo com a cobertura da modalidade.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.receiptEnabled} onChange={(event) => update("receiptEnabled", event.target.checked)} /><span><b>Aviso de recebimento</b><small>Pode aumentar o valor e depende do serviço.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.ownHandEnabled} onChange={(event) => update("ownHandEnabled", event.target.checked)} /><span><b>Mão própria</b><small>Entrega somente à pessoa indicada, quando suportado.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.collectEnabled} onChange={(event) => update("collectEnabled", event.target.checked)} /><span><b>Coleta no endereço</b><small>Ative somente após confirmar disponibilidade.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.showCheapestBadge} onChange={(event) => update("showCheapestBadge", event.target.checked)} /><span><b>Destacar mais barato</b></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.showFastestBadge} onChange={(event) => update("showFastestBadge", event.target.checked)} /><span><b>Destacar mais rápido</b></span></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>4</span><div><h2>Dados do remetente</h2><p>Preencha com os dados usados nas etiquetas e na postagem.</p></div></div>
          <div className="admin-form-grid two">
            <label>Nome / Razão social<input value={settings.senderName} onChange={(event) => update("senderName", event.target.value)} required /></label>
            <label>E-mail<input type="email" value={settings.senderEmail} onChange={(event) => update("senderEmail", event.target.value)} /></label>
            <label>Telefone<input inputMode="tel" value={settings.senderPhone} onChange={(event) => update("senderPhone", digits(event.target.value, 15))} /></label>
            <label>CPF do remetente<input inputMode="numeric" value={settings.senderDocument} onChange={(event) => update("senderDocument", digits(event.target.value, 11))} /></label>
            <label>CNPJ, quando houver<input inputMode="numeric" value={settings.senderCompanyDocument} onChange={(event) => update("senderCompanyDocument", digits(event.target.value, 14))} /></label>
            <label>Inscrição estadual<input value={settings.senderStateRegister} onChange={(event) => update("senderStateRegister", event.target.value)} /></label>
            <label className="span-two">Rua / Avenida<input value={settings.senderAddress} onChange={(event) => update("senderAddress", event.target.value)} /></label>
            <label>Número<input value={settings.senderNumber} onChange={(event) => update("senderNumber", event.target.value)} /></label>
            <label>Complemento<input value={settings.senderComplement} onChange={(event) => update("senderComplement", event.target.value)} /></label>
            <label>Bairro<input value={settings.senderDistrict} onChange={(event) => update("senderDistrict", event.target.value)} /></label>
            <label>Cidade<input value={settings.senderCity} onChange={(event) => update("senderCity", event.target.value)} /></label>
            <label>Estado<input maxLength={2} value={settings.senderState} onChange={(event) => update("senderState", event.target.value.toUpperCase().slice(0, 2))} /></label>
            <label>CEP de origem<input inputMode="numeric" value={formatCep(settings.senderPostalCode)} onChange={(event) => update("senderPostalCode", digits(event.target.value, 8))} required /></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>5</span><div><h2>Teste de cotação real</h2><p>Use um produto cadastrado e consulte um CEP antes de liberar a loja.</p></div></div>
          <div className="shipping-test-row"><label>CEP de destino<input inputMode="numeric" value={formatCep(testCep)} onChange={(event) => setTestCep(digits(event.target.value, 8))} placeholder="Ex.: 89599-999" /></label><button type="button" className="button button-outline" disabled={!connection.connected || testing} onClick={testShipping}>{testing ? "Consultando…" : "Testar frete real"}</button></div>
          {testProduct && <p className="admin-field-note">Produto usado no teste: <b>{testProduct}</b>.</p>}
          {testPackageSummary && <p className="admin-field-note">Embalagem enviada à cotação: <b>{testPackageSummary}</b>.</p>}
          <div className="shipping-test-results">
            {testQuotes.map((quote) => <article key={quote.id}><div><strong>{quote.company} — {quote.name}</strong><span>{quote.deliveryLabel}</span>{quote.badges?.length > 0 && <small>{quote.badges.join(" • ")}</small>}{quote.warning && <small className="shipping-warning">⚠ {quote.warning}</small>}</div><div><b>{formatBRL(quote.price)}</b><small>Transportadora: {formatBRL(quote.providerPrice)}{quote.packagingFee > 0 ? ` + ${formatBRL(quote.packagingFee)} operação` : ""}</small></div></article>)}
          </div>
          {testRejectedServices.length > 0 && <div className="shipping-diagnostic-box"><strong>Serviços recusados pela transportadora</strong><p>Essas mensagens vêm diretamente do Melhor Envio e mostram por que uma modalidade não apareceu.</p>{testRejectedServices.map((service) => <div key={`${service.serviceId}-${service.attempt}`}><b>{service.company} — {service.name}:</b> <span>{service.error}</span></div>)}</div>}
        </section>
      </div>

      <aside className="admin-form-side">
        <div className="admin-form-card sticky-card">
          <h2>Central de fretes</h2>
          <div className="publish-summary">
            <span>Ambiente <b>{settings.environment === "production" ? "Produção" : "Sandbox"}</b></span>
            <span>Conexão <b>{connection.connected ? "Ativa" : "Pendente"}</b></span>
            <span>Correios <b>{settings.includeCorreios ? "Ativos" : "Desativados"}</b></span>
            <span>Retirada <b>Configurada em Personalização</b></span>
            <span>CEP de origem <b>{formatCep(settings.senderPostalCode) || "Pendente"}</b></span>
          </div>
          <div className="freight-safety-note"><strong>Regra de segurança</strong><span>Sem resposta real da transportadora, o site bloqueia entrega e mantém apenas a retirada gratuita.</span></div>
          {message && <div className="upload-success">✓ {message}</div>}
          {error && <div className="form-error">{error}</div>}
          <button className="button button-dark button-full" disabled={saving}>{saving ? "Salvando…" : "Salvar fretes"}</button>
        </div>
      </aside>
    </form>
  );
}
