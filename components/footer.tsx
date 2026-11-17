import Image from "next/image";
import Link from "next/link";
import type { StoreSettings } from "@/lib/store-settings";
import type { PaymentSettings } from "@/lib/payment-settings";

const developerWhatsappUrl =
  "https://wa.me/5581981160824?text=Ol%C3%A1%2C%20vi%20seu%20contato%20no%20site%20A%26C%20Moda%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es.";

const developerInstagramUrl =
  "https://www.instagram.com/alissonsilva.ef/";

export function Footer({
  settings,
  paymentSettings,
}: {
  settings: StoreSettings;
  paymentSettings: PaymentSettings;
}) {
  const whatsappUrl = settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber}`
    : "";

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Image
            className="footer-logo"
            src={settings.logoUrl || "/brand/aec-logo.svg"}
            alt={settings.storeName}
            width={230}
            height={84}
            unoptimized
          />
          <p>{settings.description}</p>
          <p>{settings.city}</p>
        </div>

        <div>
          <h3>Ajuda</h3>
          <Link href="/como-comprar">Como comprar</Link>
          <Link href="/acompanhar-pedido">Acompanhar pedido</Link>
          <Link href="/entrega-retirada">Entrega e retirada</Link>
          <Link href="/politicas/trocas">Trocas e devoluções</Link>
          <Link href="/politicas/privacidade">Privacidade</Link>
        </div>

        <div>
          <h3>Atendimento</h3>
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          )}
          <a
            href={settings.instagramUrl}
            target="_blank"
            rel="noreferrer"
          >
            Instagram
          </a>
          <p>{settings.supportHours}</p>
        </div>

        <div>
          <h3>Compra segura</h3>
          <Link href="/seguranca">Como protegemos sua compra</Link>
          <p>
            Pagamento processado no checkout seguro da InfinitePay.
          </p>
          <p>
            {paymentSettings.showPix ? "Pix" : ""}
            {paymentSettings.showPix &&
            paymentSettings.showCreditCard
              ? " e "
              : ""}
            {paymentSettings.showCreditCard
              ? `cartão em até ${paymentSettings.maxInstallments}x`
              : ""}
            .
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <div>
          © {new Date().getFullYear()} {settings.storeName}. Todos os
          direitos reservados.
        </div>

        <div
          style={{
            marginTop: 8,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: "0.9em",
          }}
        >
          <span>
            Site desenvolvido por <strong>ALISSON DEV</strong>
          </span>

          <span aria-hidden="true">•</span>

          <a
            href={developerWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            WhatsApp
          </a>

          <span aria-hidden="true">•</span>

          <a
            href={developerInstagramUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            Instagram @alissonsilva.ef
          </a>
        </div>
      </div>
    </footer>
  );
}