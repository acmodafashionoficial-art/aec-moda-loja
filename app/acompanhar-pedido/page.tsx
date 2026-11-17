import { OrderTracker } from "@/components/order-tracker";
import { getStoreSettings } from "@/lib/store-settings";

export const metadata = { title: "Acompanhar pedido | A&C Moda" };

export const dynamic = "force-dynamic";

export default async function TrackOrderPage() {
  const settings = await getStoreSettings();
  return <main className="container page-space content-page"><span className="eyebrow">SEU PEDIDO</span><h1>Acompanhar compra</h1><p className="content-lead">Consulte pagamento, preparação, retirada ou envio usando seus dados da compra.</p><OrderTracker whatsappNumber={settings.whatsappNumber} instagramUrl={settings.instagramUrl} /></main>;
}
