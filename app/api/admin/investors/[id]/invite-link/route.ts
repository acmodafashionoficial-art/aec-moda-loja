import { NextResponse } from "next/server";
import { createInvestorPortalInviteLink } from "@/lib/investor-portal";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const result = await createInvestorPortalInviteLink({
      investorId: id,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investor.portal.whatsapp_invite",
      resourceType: "investor",
      resourceId: id,
      metadata: {
        mode: result.mode,
        expiresAt: result.expiresAt,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar convite por WhatsApp." },
      { status: securityStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}
