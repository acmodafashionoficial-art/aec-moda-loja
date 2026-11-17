"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import type { StoreSettings } from "@/lib/store-settings";
import type { PaymentSettings } from "@/lib/payment-settings";

export function SiteChrome({ children, settings, paymentSettings }: { children: React.ReactNode; settings: StoreSettings; paymentSettings: PaymentSettings }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <main className="admin-main">{children}</main>;
  return <><Header settings={settings} /><main>{children}</main><Footer settings={settings} paymentSettings={paymentSettings} /></>;
}
