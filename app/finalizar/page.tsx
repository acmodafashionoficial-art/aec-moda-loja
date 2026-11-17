import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { getStoreSettings } from "@/lib/store-settings";
import { getPaymentSettings } from "@/lib/payment-settings";

export const metadata: Metadata = { title: "Finalizar compra" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [settings, paymentSettings] = await Promise.all([getStoreSettings(), getPaymentSettings()]);
  return <div className="container page-space"><div className="page-title"><span className="eyebrow">CHECKOUT SEGURO</span><h1>Finalizar compra</h1></div><CheckoutForm settings={settings} paymentSettings={paymentSettings} /></div>;
}
