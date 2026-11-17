import { AdminPaymentForm } from "@/components/admin-payment-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getPaymentSettings } from "@/lib/payment-settings";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireAdminPage();
  const settings = await getPaymentSettings();
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return <AdminShell active="payments">
    <div className="admin-heading compact"><div><span className="eyebrow">PAGAMENTOS</span><h1>InfinitePay</h1><p>Pix, cartão e confirmação automática sem armazenar dados financeiros do cliente.</p></div></div>
    <AdminPaymentForm initialSettings={settings} siteUrl={siteUrl} />
  </AdminShell>;
}
