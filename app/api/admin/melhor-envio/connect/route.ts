import { NextResponse } from "next/server";
import {
  createMelhorEnvioOAuthRequest,
  melhorEnvioOAuthCookieName,
  melhorEnvioOAuthCookieOptions,
} from "@/lib/melhor-envio";
import { getShippingSettings } from "@/lib/shipping-settings";
import { requireAdminApi } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function GET(request: Request) {
  try {
    const session = await requireAdminApi();
    const settings = await getShippingSettings();
    const oauth = await createMelhorEnvioOAuthRequest(settings, session.id);
    const response = NextResponse.redirect(oauth.url);
    response.cookies.set(melhorEnvioOAuthCookieName(), oauth.cookieValue, melhorEnvioOAuthCookieOptions());
    noStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const url = new URL("/admin/fretes", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "Não foi possível iniciar a conexão.");
    if (securityStatus(error, 400) === 401) url.pathname = "/admin/login";
    const response = NextResponse.redirect(url);
    noStoreHeaders(response.headers);
    return response;
  }
}
