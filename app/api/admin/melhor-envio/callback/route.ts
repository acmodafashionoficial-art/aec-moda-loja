import { type NextRequest, NextResponse } from "next/server";
import {
  exchangeMelhorEnvioCode,
  melhorEnvioOAuthCookieName,
  melhorEnvioOAuthCookieOptions,
  verifyAndConsumeMelhorEnvioOAuthAttempt,
} from "@/lib/melhor-envio";
import { getShippingSettings } from "@/lib/shipping-settings";
import { writeAudit } from "@/lib/security/audit";
import { noStoreHeaders } from "@/lib/security/request";

function providerAuthorizationError(url: URL) {
  const error = String(url.searchParams.get("error") || "").slice(0, 120);
  const description = String(url.searchParams.get("error_description") || "").slice(0, 300);
  if (!error) return "";
  if (/access_denied/i.test(error)) return "A autorização foi cancelada no Melhor Envio.";
  if (/invalid_scope/i.test(error)) return "O Melhor Envio recusou as permissões solicitadas. Tente novamente com a permissão shipping-calculate.";
  if (/invalid_request|redirect/i.test(error) || /redirect/i.test(description)) {
    return "A URL de retorno cadastrada no Melhor Envio não coincide exatamente com a URL usada pelo site.";
  }
  return description ? `O Melhor Envio não autorizou a conexão: ${description}` : `O Melhor Envio não autorizou a conexão: ${error}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = new URL("/admin/fretes", request.url);
  try {
    const providerError = providerAuthorizationError(url);
    if (providerError) throw new Error(providerError);

    const code = String(url.searchParams.get("code") || "");
    const state = String(url.searchParams.get("state") || "");
    if (!code || code.length > 2_000) throw new Error("O Melhor Envio não devolveu um código de autorização válido.");

    const settings = await getShippingSettings();
    const validAttempt = await verifyAndConsumeMelhorEnvioOAuthAttempt({
      returnedState: state,
      cookieValue: request.cookies.get(melhorEnvioOAuthCookieName())?.value,
      environment: settings.environment,
    });
    if (!validAttempt) throw new Error("A autorização recebida não corresponde à tentativa iniciada. Entre novamente no painel e tente mais uma vez.");

    await exchangeMelhorEnvioCode(code);
    await writeAudit({ request, action: "shipping.connect", resourceType: "integration" });
    target.searchParams.set("connected", "1");
  } catch (error) {
    await writeAudit({ request, action: "shipping.connect", resourceType: "integration", outcome: "failure" });
    target.searchParams.set("error", error instanceof Error ? error.message : "Não foi possível concluir a conexão.");
  }

  const response = NextResponse.redirect(target);
  response.cookies.set(melhorEnvioOAuthCookieName(), "", melhorEnvioOAuthCookieOptions(0));
  noStoreHeaders(response.headers);
  return response;
}
