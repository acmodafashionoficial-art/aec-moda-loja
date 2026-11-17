import Link from "next/link";
import { OrderSuccessActions } from "@/components/order-success-actions";
import { verifyAndConfirmInfinitePayPayment } from "@/lib/infinitepay";
import { buildWhatsAppUrl, localDeliveryCustomerMessage, pickupCustomerMessage } from "@/lib/contact-links";
import { getStoreSettings } from "@/lib/store-settings";
import { isLocalDeliveryService } from "@/lib/order-types";
import { isUuid, safeHttpsUrl } from "@/lib/security/validation";

type Params = { code?: string; provider?: string; receipt_url?: string; order_nsu?: string; slug?: string; capture_method?: string; transaction_nsu?: string };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const orderNsu = String(params.order_nsu || "").slice(0, 100);
  const transactionNsu = String(params.transaction_nsu || "").slice(0, 180);
  const slug = String(params.slug || "").slice(0, 180);
  const receiptUrl = safeHttpsUrl(params.receipt_url, 1000);
  let approved = false;
  let pickup = false;
  let localDelivery = false;
  let message = "Estamos aguardando a confirmação do pagamento. Consulte o pedido novamente em alguns instantes.";

  if (params.provider === "infinitepay" && isUuid(orderNsu) && /^[a-zA-Z0-9._-]{3,180}$/.test(transactionNsu) && /^[a-zA-Z0-9._-]{3,180}$/.test(slug)) {
    try {
      const confirmation = await verifyAndConfirmInfinitePayPayment({ orderNsu, transactionNsu, slug, receiptUrl, captureMethod: String(params.capture_method || "").slice(0, 40) });
      approved = true;
      pickup = confirmation.order?.fulfillmentType === "pickup";
      localDelivery = isLocalDeliveryService(confirmation.order?.shippingService);
      message = pickup
        ? "Pagamento confirmado com segurança. Aguarde o aviso de que o pedido está pronto e combine a retirada com a loja."
        : localDelivery
          ? "Pagamento confirmado com segurança. A loja entrará em contato para confirmar o endereço e combinar a entrega gratuita em Jataúba."
          : "Pagamento confirmado com segurança pela InfinitePay. O pedido já foi enviado para preparação.";
    } catch (error) {
      console.error("Confirmação no retorno InfinitePay:", error instanceof Error ? error.message : "falha");
    }
  }

  const cleanCode = String(params.code || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  const needsContact = pickup || localDelivery;
  const settings = needsContact ? await getStoreSettings() : null;
  const whatsappUrl = settings
    ? buildWhatsAppUrl(
        settings.whatsappNumber,
        pickup ? pickupCustomerMessage(cleanCode || "sem código") : localDeliveryCustomerMessage(cleanCode || "sem código"),
      )
    : "";
  const contactUrl = whatsappUrl || (needsContact ? settings?.instagramUrl || "" : "");
  const contactLabel = pickup
    ? whatsappUrl ? "Combinar retirada pelo WhatsApp" : "Combinar retirada pelo Instagram"
    : whatsappUrl ? "Combinar entrega pelo WhatsApp" : "Falar pelo Instagram";

  return (
    <div className="container page-space">
      <div className={`status-card ${approved ? "success" : "pending"}`}>
        <span>{approved ? "✓" : "…"}</span>
        <h1>{approved ? "Pagamento aprovado!" : "Confirmando pagamento"}</h1>
        <p>{message}</p>
        {receiptUrl && approved && <a className="button button-outline" href={receiptUrl} target="_blank" rel="noopener noreferrer">Abrir comprovante ↗</a>}
        <OrderSuccessActions code={cleanCode} clearCart={approved} contactUrl={approved ? contactUrl : ""} contactLabel={contactLabel} />
        {!approved && <Link className="button button-outline" href="/acompanhar-pedido">Consultar pedido</Link>}
      </div>
    </div>
  );
}
