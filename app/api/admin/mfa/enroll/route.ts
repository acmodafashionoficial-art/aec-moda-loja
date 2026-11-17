import { NextResponse } from "next/server";
import {
  adminMfaEnrollCookieName,
  adminPendingMaxAge,
  authCookieOptions,
  sealPrivateState,
} from "@/lib/admin-auth";
import { getPendingMfaClient, verifiedTotpFactors } from "@/lib/admin-mfa";
import { writeAudit } from "@/lib/security/audit";
import { assertSameOrigin, noStoreHeaders, securityStatus } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client, pending } = await getPendingMfaClient();
    const listed = await client.auth.mfa.listFactors();
    if (listed.error) throw listed.error;
    if (verifiedTotpFactors(listed.data).length) throw new Error("Esta conta já possui autenticação em duas etapas.");

    // Remove fatores incompletos de tentativas anteriores para não acumular registros.
    const allFactors = ((listed.data as unknown as { all?: Array<{ id: string; status?: string }> }).all || listed.data.totp || []);
    for (const factor of allFactors) {
      if (factor.status !== "verified") await client.auth.mfa.unenroll({ factorId: factor.id });
    }

    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "A&C Moda" });
    if (enrolled.error) throw enrolled.error;
    const response = NextResponse.json({
      ok: true,
      qrCode: enrolled.data.totp.qr_code,
      secret: enrolled.data.totp.secret,
    }, { headers: noStoreHeaders() });
    response.cookies.set(
      adminMfaEnrollCookieName(),
      sealPrivateState({ factorId: enrolled.data.id, userId: pending.userId, expiresAt: Math.floor(Date.now() / 1000) + adminPendingMaxAge() }),
      authCookieOptions(adminPendingMaxAge()),
    );
    await writeAudit({ request, actor: pending.email, action: "admin.mfa_enrollment_started", outcome: "success" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível configurar o código." }, { status: securityStatus(error, 400), headers: noStoreHeaders() });
  }
}
