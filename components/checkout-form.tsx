"use client";

import { FormEvent, useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatBRL } from "@/lib/currency";
import type { StoreSettings } from "@/lib/store-settings";
import type { PaymentSettings } from "@/lib/payment-settings";

type Quote = { id: string; serviceId: string; name: string; company: string; price: number; providerPrice: number; packagingFee: number; deliveryTime: number; deliveryLabel: string; packageLabel: string; volumeCount: number; warning?: string; badges: string[]; expiresAt: string };
type Address = { postalCode: string; street: string; neighborhood: string; city: string; state: string; complement: string; number: string; reference: string };
type FulfillmentChoice = "shipping" | "local_delivery" | "pickup";

const EMPTY_ADDRESS: Address = { postalCode: "", street: "", neighborhood: "", city: "", state: "", complement: "", number: "", reference: "" };

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function normalizeLocation(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function CheckoutForm({ settings, paymentSettings }: { settings: StoreSettings; paymentSettings: PaymentSettings }) {
  const { items, subtotal } = useCart();
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>("shipping");
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [localAddressValidated, setLocalAddressValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");

  const isShipping = fulfillment === "shipping";
  const isLocalDelivery = fulfillment === "local_delivery";
  const selectedQuote = useMemo(() => quotes.find((quote) => quote.id === selectedQuoteId), [quotes, selectedQuoteId]);
  const qualifiesForFreeShipping = isShipping && settings.freeShippingFrom > 0 && subtotal >= settings.freeShippingFrom;
  const shippingCost = fulfillment === "pickup" || isLocalDelivery || qualifiesForFreeShipping ? 0 : selectedQuote?.price || 0;
  const total = subtotal + shippingCost;
  const canSubmit = fulfillment === "pickup" || (isLocalDelivery ? localAddressValidated : Boolean(selectedQuote));

  function updateAddress(key: keyof Address, value: string) {
    setAddress((current) => ({ ...current, [key]: value }));
    if (key === "city" || key === "state") setLocalAddressValidated(false);
  }

  function changeFulfillment(next: FulfillmentChoice) {
    setFulfillment(next);
    setError("");
    setQuoteMessage("");
    if (next !== "shipping") {
      setQuotes([]);
      setSelectedQuoteId("");
    }
    if (next !== "local_delivery") setLocalAddressValidated(false);
  }

  function changePostalCode(value: string) {
    const postalCode = formatCep(value);
    setAddress((current) => ({
      ...current,
      postalCode,
      street: "",
      neighborhood: "",
      city: "",
      state: "",
      complement: "",
    }));
    setQuotes([]);
    setSelectedQuoteId("");
    setLocalAddressValidated(false);
    setQuoteMessage("");
    setError("");
  }

  async function calculateDelivery() {
    const postalCode = address.postalCode.replace(/\D/g, "");
    if (postalCode.length !== 8) {
      setError("Informe um CEP válido para calcular a entrega.");
      return;
    }
    setCalculating(true);
    setError("");
    setQuoteMessage("");
    setLocalAddressValidated(false);
    try {
      const addressResponse = await fetch(`/api/address/cep?cep=${postalCode}`);
      const addressData = await addressResponse.json();
      if (!addressResponse.ok) throw new Error(addressData.error || "CEP não encontrado.");

      const foundAddress = {
        postalCode: formatCep(postalCode),
        street: addressData.street || "",
        neighborhood: addressData.neighborhood || "",
        city: addressData.city || "",
        state: addressData.state || "",
        complement: addressData.complement || "",
      };
      setAddress((current) => ({ ...current, ...foundAddress }));

      if (isLocalDelivery) {
        const correctCity = normalizeLocation(foundAddress.city) === normalizeLocation(settings.localDeliveryCity);
        const correctState = foundAddress.state.toUpperCase() === settings.localDeliveryState.toUpperCase();
        if (!correctCity || !correctState) {
          throw new Error(`A entrega local grátis está disponível somente em ${settings.localDeliveryCity}-${settings.localDeliveryState}. Para outro endereço, escolha envio por transportadora.`);
        }
        setQuotes([]);
        setSelectedQuoteId("");
        setLocalAddressValidated(true);
        setQuoteMessage("Endereço confirmado para entrega local gratuita.");
        return;
      }

      const quoteResponse = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postalCode,
          items: items.map(({ productId, quantity }) => ({ productId, quantity })),
        }),
      });
      const quoteData = await quoteResponse.json();
      if (!quoteResponse.ok) throw new Error(quoteData.error || "Não foi possível calcular o frete.");
      setQuotes(quoteData.quotes || []);
      const first = quoteData.quotes?.[0];
      setSelectedQuoteId(first?.id || "");
      setQuoteMessage(first ? "Valores reais consultados agora. A cotação será conferida novamente antes do pagamento." : "");
    } catch (reason) {
      setQuotes([]);
      setSelectedQuoteId("");
      setLocalAddressValidated(false);
      setError(reason instanceof Error ? reason.message : "Não foi possível calcular a entrega.");
    } finally {
      setCalculating(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (isShipping && !selectedQuote) {
      setError("Calcule o frete e escolha uma opção de entrega.");
      setLoading(false);
      return;
    }
    if (isLocalDelivery && !localAddressValidated) {
      setError("Valide o CEP de Jataúba antes de continuar.");
      setLoading(false);
      return;
    }
    if (isLocalDelivery && address.reference.trim().length < 3) {
      setError("Informe um ponto de referência para facilitar a entrega.");
      setLoading(false);
      return;
    }

    const form = new FormData(event.currentTarget);
    const customer = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { ...customer, ...address },
          fulfillment: fulfillment === "shipping" ? "delivery" : fulfillment,
          shippingServiceId: isShipping ? selectedQuoteId : fulfillment === "pickup" ? "store-pickup" : "local-delivery-jatauba",
          items: items.map(({ productId, quantity, size, color }) => ({ productId, quantity, size, color })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar o pagamento.");
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  if (!items.length) return <p>Adicione produtos à sacola antes de finalizar.</p>;

  return (
    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={submit}>
        <div className="checkout-security-banner">
          <strong>Compra protegida</strong>
          <span>Os preços e o estoque são validados novamente no servidor. O pagamento acontece no ambiente seguro da InfinitePay e só é aprovado depois de uma verificação direta na API.</span>
        </div>

        <div className="form-section">
          <span className="step-number">1</span>
          <div>
            <h2>Seus dados</h2>
            <div className="form-grid two-columns">
              <label>Nome completo<input name="name" autoComplete="name" required /></label>
              <label>E-mail<input type="email" name="email" autoComplete="email" required /></label>
              <label>Telefone / WhatsApp<input name="phone" inputMode="tel" autoComplete="tel" required /></label>
              <label>CPF<input name="document" inputMode="numeric" autoComplete="off" required /></label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <span className="step-number">2</span>
          <div>
            <h2>Como deseja receber?</h2>
            <div className="fulfillment-grid">
              {settings.localDeliveryEnabled && <label className={`fulfillment-card ${isLocalDelivery ? "selected" : ""}`}>
                <input type="radio" name="fulfillment-choice" value="local_delivery" checked={isLocalDelivery} onChange={() => changeFulfillment("local_delivery")} />
                <strong>Entrega grátis em {settings.localDeliveryCity}</strong><span>A loja combina a entrega pelo WhatsApp.</span>
              </label>}
              <label className={`fulfillment-card ${isShipping ? "selected" : ""}`}>
                <input type="radio" name="fulfillment-choice" value="shipping" checked={isShipping} onChange={() => changeFulfillment("shipping")} />
                <strong>Envio para outras cidades</strong><span>Compare transportadoras e prazos pelo CEP.</span>
              </label>
              {settings.pickupEnabled && <label className={`fulfillment-card ${fulfillment === "pickup" ? "selected" : ""}`}>
                <input type="radio" name="fulfillment-choice" value="pickup" checked={fulfillment === "pickup"} onChange={() => changeFulfillment("pickup")} />
                <strong>Retirar na loja</strong><span>Grátis em {settings.city}.</span>
              </label>}
            </div>
          </div>
        </div>

        {fulfillment !== "pickup" ? (
          <>
            <div className="form-section">
              <span className="step-number">3</span>
              <div>
                <h2>{isLocalDelivery ? "Endereço para entrega local" : "Endereço de entrega"}</h2>
                <p className="field-explanation">{isLocalDelivery ? `A entrega gratuita será liberada somente quando o CEP for confirmado em ${settings.localDeliveryCity}-${settings.localDeliveryState}.` : "O frete só será exibido quando o CEP for validado e a cotação real estiver conectada."}</p>
                <div className="cep-row">
                  <label>CEP<input value={address.postalCode} onChange={(event) => changePostalCode(event.target.value)} inputMode="numeric" autoComplete="postal-code" required /></label>
                  <button type="button" className="button button-outline" disabled={calculating} onClick={calculateDelivery}>{calculating ? "Consultando…" : isLocalDelivery ? "Validar endereço" : "Calcular frete"}</button>
                </div>
                <div className="form-grid two-columns">
                  <label>Estado<input value={address.state} onChange={(event) => updateAddress("state", event.target.value.toUpperCase().slice(0, 2))} maxLength={2} readOnly={isLocalDelivery} required /></label>
                  <label>Cidade<input value={address.city} onChange={(event) => updateAddress("city", event.target.value)} readOnly={isLocalDelivery} required /></label>
                  <label className="span-two">Rua / Avenida<input value={address.street} onChange={(event) => updateAddress("street", event.target.value)} autoComplete="street-address" required /></label>
                  <label>Número<input value={address.number} onChange={(event) => updateAddress("number", event.target.value)} required /></label>
                  <label>Complemento<input value={address.complement} onChange={(event) => updateAddress("complement", event.target.value)} /></label>
                  <label>Bairro<input value={address.neighborhood} onChange={(event) => updateAddress("neighborhood", event.target.value)} required /></label>
                  {isLocalDelivery && <label className="span-two">Ponto de referência<input value={address.reference} onChange={(event) => updateAddress("reference", event.target.value)} placeholder="Ex.: próximo à praça, mercadinho ou escola" required /></label>}
                </div>
                {isLocalDelivery && localAddressValidated && <div className="local-delivery-confirmation"><strong>✓ Entrega local gratuita confirmada</strong><span>{settings.localDeliveryInstructions}</span><small>Atendimento: {settings.supportHours}</small></div>}
              </div>
            </div>
            {isShipping && <div className="form-section">
              <span className="step-number">4</span>
              <div>
                <h2>Escolha o frete</h2>
                {!quotes.length && <p className="field-explanation">Informe o CEP acima para visualizar valores e prazos.</p>}
                <div className="shipping-options-list">
                  {quotes.map((quote) => <label className={`shipping-option ${selectedQuoteId === quote.id ? "selected" : ""}`} key={quote.id}>
                    <input type="radio" name="shipping" value={quote.id} checked={selectedQuoteId === quote.id} onChange={() => setSelectedQuoteId(quote.id)} />
                    <span><strong>{quote.company} — {quote.name}</strong>{quote.badges?.length > 0 && <span className="shipping-badges">{quote.badges.map((badge) => <b key={badge}>{badge}</b>)}</span>}<small>{quote.deliveryLabel}</small><small>Embalagem calculada: {quote.packageLabel}</small>{quote.packagingFee > 0 && <small>Inclui {formatBRL(quote.packagingFee)} de embalagem/operação.</small>}{quote.warning && <small className="shipping-warning">⚠ {quote.warning}</small>}</span>
                    <strong>{qualifiesForFreeShipping ? "Grátis" : formatBRL(quote.price)}</strong>
                  </label>)}
                </div>
                {qualifiesForFreeShipping && <p className="quote-message success-text">Seu pedido atingiu o valor de frete grátis.</p>}{quoteMessage && <p className="quote-message">{quoteMessage}</p>}
              </div>
            </div>}
          </>
        ) : (
          <div className="pickup-checkout-card">
            <span className="step-number">3</span>
            <div><h2>{settings.pickupName}</h2><strong>{settings.pickupAddress}</strong><p>{settings.pickupInstructions}</p><p className="pickup-contact-hint">Após o pagamento, você poderá falar com a loja para combinar o dia e o horário da retirada. Aguarde a confirmação de que o pedido está pronto antes de ir ao endereço.</p><b>Valor da retirada: grátis</b></div>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        <button className="button button-dark button-full" disabled={loading || calculating || !canSubmit}>
          {loading ? "Preparando pagamento…" : "Ir para pagamento seguro"}
        </button>
        <div className="secure-checkout-notes"><span>✓ Pix e cartão em até {paymentSettings.maxInstallments}x</span><span>✓ Pagamento verificado na InfinitePay</span><span>✓ Dados do cartão não passam pela loja</span></div>
      </form>

      <aside className="order-summary checkout-summary">
        <h2>Seu pedido</h2>
        {items.map((item) => <div className="checkout-item" key={`${item.productId}-${item.size}-${item.color}`}><span>{item.quantity}× {item.name}<small>{item.size} • {item.color}</small></span><strong>{formatBRL(item.price * item.quantity)}</strong></div>)}
        <hr />
        <div><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div>
        <div><span>{fulfillment === "pickup" ? "Retirada" : isLocalDelivery ? "Entrega local" : "Frete e embalagem"}</span><strong>{fulfillment === "pickup" || isLocalDelivery ? "Grátis" : selectedQuote ? formatBRL(shippingCost) : "A calcular"}</strong></div>
        <hr />
        <div className="summary-total"><span>Total</span><strong>{formatBRL(total)}</strong></div>
      </aside>
    </div>
  );
}
