import { AdminShippingForm } from "@/components/admin-shipping-form";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-auth";
import { getMelhorEnvioConnectionStatus } from "@/lib/melhor-envio";
import { getShippingSettings } from "@/lib/shipping-settings";

export const dynamic = "force-dynamic";

export default async function ShippingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const [settings, connection] = await Promise.all([getShippingSettings(), getMelhorEnvioConnectionStatus()]);
  const error = typeof params.error === "string" ? params.error : "";
  const notice = error || (params.connected === "1" ? "Conta do Melhor Envio conectada com sucesso." : params.disconnected === "1" ? "Conta desconectada." : "");
  return (
    <AdminShell active="shipping">
      <div className="admin-heading compact"><div><span className="eyebrow">FRETE REAL E SEGURO</span><h1>Correios e transportadoras</h1><p>PAC, SEDEX, opções privadas e retirada grátis, com cotação validada no servidor.</p></div></div>
      <AdminShippingForm initialSettings={settings} initialConnection={connection} notice={notice} />
    </AdminShell>
  );
}
