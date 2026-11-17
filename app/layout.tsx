import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import { SiteChrome } from "@/components/site-chrome";
import { SiteAnalytics } from "@/components/site-analytics";
import { getStoreSettings } from "@/lib/store-settings";
import { getPaymentSettings } from "@/lib/payment-settings";
import { assertProductionSecurity } from "@/lib/security/env";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "A&C Moda | Moda para todos",
    template: "%s | A&C Moda",
  },
  description:
    "Moda feminina, masculina, infantil e plus size. Entregamos para todo o Brasil.",
  icons: {
    icon: [
      {
        url: "/brand/aec-logo.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/brand/aec-logo.svg",
  },
  openGraph: {
    title: "A&C Moda",
    description: "Moda para todos os estilos e tamanhos.",
    type: "website",
    locale: "pt_BR",
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  assertProductionSecurity();

  const [settings, paymentSettings] = await Promise.all([
    getStoreSettings(),
    getPaymentSettings(),
  ]);

  const style = {
    "--brand-primary": settings.primaryColor,
    "--brand-accent": settings.accentColor,
    "--brand-background": settings.backgroundColor,
  } as CSSProperties;

  return (
    <html lang="pt-BR">
      <body style={style}>
        <CartProvider>
          <SiteAnalytics />
          <SiteChrome
            settings={settings}
            paymentSettings={paymentSettings}
          >
            {children}
          </SiteChrome>
        </CartProvider>
      </body>
    </html>
  );
}