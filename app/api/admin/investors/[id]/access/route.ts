import { NextResponse } from "next/server";
import { inviteInvestorPortalAccess, revokeInvestorPortalAccess } from "@/lib/investor-portal";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, securityStatus } from "@/lib/security/request";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const result = await inviteInvestorPortalAccess(id);

    await writeAudit({
      request,
      action: "investor.portal.enable",
      resourceType: "investor",
      resourceId: id,
      metadata: { mode: result.mode, adminName: session.displayName },
    });

    const message = result.mode === "invite_sent"
      ? "Convite enviado por e-mail."
      : result.mode === "recovery_sent"
        ? "Novo e-mail de acesso enviado. O link anterior pode ser ignorado."
        : result.mode === "admin_linked"
          ? "Conta administrativa vinculada ao Portal do Investidor. Use o mesmo e-mail e a mesma senha nos dois acessos."
          : "Acesso preparado para o investidor.";

    return NextResponse.json({ ok: true, mode: result.mode, message }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao liberar acesso." },
      { status: securityStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}

export async function DELETE(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const changed = await revokeInvestorPortalAccess(id);

    await writeAudit({
      request,
      action: "investor.portal.revoke",
      resourceType: "investor",
      resourceId: id,
      metadata: { changed, adminName: session.displayName },
    });

    return NextResponse.json({ ok: true, changed }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao bloquear acesso." },
      { status: securityStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}
