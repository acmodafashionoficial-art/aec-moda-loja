import { NextResponse } from "next/server";
import { lookupPostalCode } from "@/lib/cep";
import { assertSameOrigin, hashedClientId, noStoreHeaders, securityStatus } from "@/lib/security/request";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await checkRateLimit(`cep:${hashedClientId(request, "cep")}`, { limit: 30, windowSeconds: 60, blockSeconds: 5 * 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Muitas consultas. Aguarde um momento." }, { status: 429, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const postalCode = new URL(request.url).searchParams.get("cep")?.replace(/\D/g, "").slice(0, 8) || "";
    if (postalCode.length !== 8) return NextResponse.json({ error: "CEP inválido." }, { status: 400, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    const address = await lookupPostalCode(postalCode);
    if (!address) return NextResponse.json({ error: "CEP não encontrado." }, { status: 404, headers: noStoreHeaders(rateLimitHeaders(limit)) });
    return NextResponse.json({ postalCode, ...address }, { headers: noStoreHeaders(rateLimitHeaders(limit)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o CEP." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
