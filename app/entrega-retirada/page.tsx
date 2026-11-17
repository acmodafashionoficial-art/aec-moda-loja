import type { Metadata } from "next";
import { getShippingSettings } from "@/lib/shipping-settings";
import { getStoreSettings } from "@/lib/store-settings";

export const metadata: Metadata = { title: "Entrega e retirada" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const [settings, shipping] = await Promise.all([getStoreSettings(), getShippingSettings()]);
  return <div className="container page-space content-page">
    <span className="eyebrow">RECEBA COMO PREFERIR</span>
    <h1>Entrega local, envio para o Brasil e retirada</h1>
    <div className="content-cards three">
      {settings.localDeliveryEnabled && <section>
        <h2>{settings.localDeliveryName}</h2>
        <p>Disponível somente para endereços confirmados em <strong>{settings.localDeliveryCity}-{settings.localDeliveryState}</strong>.</p>
        <p>{settings.localDeliveryInstructions}</p>
        <p>Depois do pagamento, a cliente poderá falar com a loja pelo WhatsApp para confirmar o endereço e combinar a entrega.</p>
        <p className="highlight-line">Entrega local sem custo.</p>
      </section>}
      <section>
        <h2>Correios e transportadoras</h2>
        <p>Quando disponíveis para o CEP, o checkout apresenta PAC, SEDEX e outras opções habilitadas pela loja.</p>
        <p>O prazo exibido inclui até {shipping.preparationDays} dia(s) útil(eis) para preparação do pedido.</p>
        <p>O valor é conferido novamente no servidor antes de abrir o pagamento.</p>
      </section>
      {settings.pickupEnabled && <section>
        <h2>{settings.pickupName}</h2>
        <p><strong>{settings.pickupAddress}</strong></p>
        <p>{settings.pickupInstructions}</p>
        <p>Depois do pagamento, a cliente poderá entrar em contato com a loja para combinar o dia e o horário. A retirada deve acontecer somente após a confirmação de que o pedido está pronto.</p>
        <p className="highlight-line">Retirada sem custo.</p>
      </section>}
    </div>
    <p className="legal-note">Para endereços fora de {settings.localDeliveryCity}-{settings.localDeliveryState}, selecione uma transportadora disponível no checkout. A retirada na loja continuará disponível quando estiver ativa.</p>
  </div>;
}
