"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics-client";

function productSlugFromPath(pathname: string) {
  if (!pathname.startsWith("/produto/")) return "";

  try {
    return decodeURIComponent(pathname.slice("/produto/".length)).slice(0, 160);
  } catch {
    return pathname.slice("/produto/".length, 160);
  }
}

function trackOncePerSession(key: string, callback: () => void) {
  try {
    const storageKey = `aec_analytics_once:${key}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Se o navegador bloquear o sessionStorage, ainda registramos o evento.
  }

  callback();
}

export function SiteAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    trackAnalyticsEvent("page_view", { path: pathname });

    const productSlug = productSlugFromPath(pathname);
    if (productSlug) {
      trackAnalyticsEvent("product_view", {
        path: pathname,
        productSlug,
      });
    }

    if (pathname === "/finalizar") {
      trackAnalyticsEvent("checkout_start", { path: pathname });
    }

    if (pathname === "/pedido/sucesso") {
      trackOncePerSession("order_success", () => {
        trackAnalyticsEvent("order_success", { path: pathname });
      });
    }
  }, [pathname]);

  return null;
}
