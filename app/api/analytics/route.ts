import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import {
  enforceContentLength,
  hashedClientId,
  noStoreHeaders,
} from "@/lib/security/request";

export const runtime = "nodejs";

const EVENT_TYPES = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "checkout_start",
  "order_success",
]);

function clean(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export async function POST(request: Request) {
  try {
    enforceContentLength(request, 8 * 1024);

    const limit = await checkRateLimit(
      `store-analytics:${hashedClientId(request, "analytics")}`,
      {
        limit: 180,
        windowSeconds: 10 * 60,
        blockSeconds: 20 * 60,
      },
    );

    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false },
        {
          status: 429,
          headers: noStoreHeaders(rateLimitHeaders(limit)),
        },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const eventType = clean(body.eventType, 40);
    const visitorId = clean(body.visitorId, 80);
    const sessionId = clean(body.sessionId, 80);
    const path = clean(body.path, 240) || "/";
    const productSlug = clean(body.productSlug, 160) || null;
    const referrerHost = clean(body.referrerHost, 180) || null;

    if (
      !EVENT_TYPES.has(eventType) ||
      visitorId.length < 8 ||
      sessionId.length < 8 ||
      !path.startsWith("/") ||
      path.startsWith("/admin")
    ) {
      return NextResponse.json(
        { ok: false },
        {
          status: 400,
          headers: noStoreHeaders(rateLimitHeaders(limit)),
        },
      );
    }

    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { ok: true, stored: false },
        {
          status: 202,
          headers: noStoreHeaders(rateLimitHeaders(limit)),
        },
      );
    }

    const { error } = await supabase.from("analytics_events").insert({
      visitor_id: visitorId,
      session_id: sessionId,
      event_type: eventType,
      path,
      product_slug: productSlug,
      referrer_host: referrerHost,
    });

    if (error) {
      throw new Error(`Erro ao registrar estatística: ${error.message}`);
    }

    return NextResponse.json(
      { ok: true, stored: true },
      {
        headers: noStoreHeaders(rateLimitHeaders(limit)),
      },
    );
  } catch {
    // Estatísticas nunca devem impedir a navegação ou compra do cliente.
    return NextResponse.json(
      { ok: false },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }
}
