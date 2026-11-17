import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { enforceContentLength, hashedClientId, noStoreHeaders } from "@/lib/security/request";
import { isUuid, safeHttpsUrl } from "@/lib/security/validation";

function safeSignature(body: string, received: string, secret: string) {
  const digestHex = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const digestBase64 = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const normalized = received.replace(/^sha256=/i, "").trim();
  for (const expected of [digestHex, digestBase64]) {
    const left = Buffer.from(expected);
    const right = Buffer.from(normalized);
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return true;
  }
  return false;
}

function findOrderId(payload: Record<string, unknown>) {
  const data = (payload.data || {}) as Record<string, unknown>;
  const custom = (data.custom || payload.custom || {}) as Record<string, unknown>;
  const candidates = [custom.order_id, custom.orderId, data.order_id, payload.order_id, payload.orderId];
  return candidates.map(String).find(isUuid) || "";
}

export async function POST(request: Request) {
  enforceContentLength(request, 256 * 1024);
  const limit = await checkRateLimit(`webhook-melhor-envio:${hashedClientId(request, "webhook-melhor-envio")}`, { limit: 120, windowSeconds: 60, blockSeconds: 5 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Limite excedido." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 256 * 1024) return NextResponse.json({ error: "Conteúdo muito grande." }, { status: 413, headers: noStoreHeaders() });
  const secret = String(process.env.MELHOR_ENVIO_WEBHOOK_SECRET || process.env.MELHOR_ENVIO_CLIENT_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503, headers: noStoreHeaders() });
  const signature = request.headers.get("x-me-signature") || "";
  if (!signature || !safeSignature(body, signature, secret)) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401, headers: noStoreHeaders() });

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400, headers: noStoreHeaders() }); }
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const eventId = String(payload.id || crypto.createHash("sha256").update(body).digest("hex")).slice(0, 180);
    const safePayload = JSON.parse(JSON.stringify(payload).slice(0, 200_000));
    await supabase.from("shipping_events").upsert({ id: eventId, event_type: String(payload.event || payload.type || "shipping_update").slice(0, 120), payload: safePayload, received_at: new Date().toISOString() });
    const orderId = findOrderId(payload);
    if (orderId) {
      const data = (payload.data || payload) as Record<string, unknown>;
      await supabase.from("orders").update({
        shipping_status: String(data.status || payload.status || "updated").slice(0, 120),
        shipping_tracking: String(data.tracking || data.tracking_code || "").replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 120) || null,
        shipping_tracking_url: safeHttpsUrl(data.tracking_url, 500) || null,
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
    }
  }
  return NextResponse.json({ received: true }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
}
