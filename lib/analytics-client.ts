"use client";

export type AnalyticsEventType =
  | "page_view"
  | "product_view"
  | "add_to_cart"
  | "checkout_start"
  | "order_success";

type AnalyticsDetails = {
  path?: string;
  productSlug?: string;
};

const VISITOR_KEY = "aec_analytics_visitor";
const SESSION_KEY = "aec_analytics_session";

let memoryVisitorId = "";
let memorySessionId = "";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

function getStoredId(
  storage: Storage | undefined,
  key: string,
  fallback: "visitor" | "session",
) {
  try {
    const current = storage?.getItem(key);
    if (current) return current;

    const created = createId();
    storage?.setItem(key, created);
    return created;
  } catch {
    if (fallback === "visitor") {
      if (!memoryVisitorId) memoryVisitorId = createId();
      return memoryVisitorId;
    }

    if (!memorySessionId) memorySessionId = createId();
    return memorySessionId;
  }
}

function getReferrerHost() {
  if (!document.referrer) return "";

  try {
    return new URL(document.referrer).hostname.slice(0, 180);
  } catch {
    return "";
  }
}

export function trackAnalyticsEvent(
  eventType: AnalyticsEventType,
  details: AnalyticsDetails = {},
) {
  if (typeof window === "undefined") return;

  const visitorId = getStoredId(window.localStorage, VISITOR_KEY, "visitor");
  const sessionId = getStoredId(window.sessionStorage, SESSION_KEY, "session");

  const payload = {
    eventType,
    visitorId,
    sessionId,
    path: (details.path || window.location.pathname || "/").slice(0, 240),
    productSlug: details.productSlug?.slice(0, 160) || "",
    referrerHost: getReferrerHost(),
  };

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}
