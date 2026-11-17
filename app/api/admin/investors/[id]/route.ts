import { NextResponse } from "next/server";
import {
  archiveInvestor,
  deleteUnusedInvestor,
  getInvestorById,
  purgeTestInvestor,
  updateInvestor,
} from "@/lib/investment-repository";
import { unlinkInvestorPortalAccess } from "@/lib/investor-portal";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import { noStoreHeaders, readJson, securityStatus } from "@/lib/security/request";

type Props = { params: Promise<{ id: string }> };

type Body = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  active?: unknown;
};

export async function PUT(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const body = await readJson<Body>(request, 32 * 1024);
    const current = await getInvestorById(id);
    if (!current) throw new Error("Investidor não encontrado.");

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const notes = String(body.notes || "").trim();
    const active = body.active !== false;
    if (name.length < 2) throw new Error("Informe o nome do investidor.");

    const oldEmail = String(current.email || "").trim().toLowerCase();
    const accessWasUnlinked =
      oldEmail !== email && current.portalStatus !== "none"
        ? await unlinkInvestorPortalAccess(id)
        : false;

    await updateInvestor({
      investorId: id,
      name,
      email,
      phone,
      notes,
      active,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investor.update",
      resourceType: "investor",
      resourceId: id,
      metadata: {
        name,
        active,
        emailChanged: oldEmail !== email,
        accessWasUnlinked,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(
      { ok: true, accessWasUnlinked },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar investidor." },
      { status: securityStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}

export async function DELETE(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const url = new URL(request.url);

    if (url.searchParams.get("purgeTest") === "1") {
      if (url.searchParams.get("confirm") !== "APAGAR TESTE") {
        return NextResponse.json(
          { error: "Confirmação inválida para exclusão total." },
          { status: 400, headers: noStoreHeaders() },
        );
      }

      const result = await purgeTestInvestor(id);
      if (result.status === "blocked_sales") {
        return NextResponse.json(
          {
            error:
              "Este cadastro participou de um lote que já possui venda. Cancele primeiro as vendas de teste relacionadas; depois a exclusão total será liberada.",
            blockedBySales: true,
          },
          { status: 409, headers: noStoreHeaders() },
        );
      }
      if (result.status === "not_found") {
        return NextResponse.json(
          { error: "Investidor não encontrado." },
          { status: 404, headers: noStoreHeaders() },
        );
      }

      await writeAudit({
        request,
        action: "investor.test_purge",
        resourceType: "investor",
        resourceId: id,
        metadata: {
          lotsDeleted: result.lotsDeleted,
          otherParticipantsRemoved: result.otherParticipantsRemoved,
          adminName: session.displayName,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          deleted: true,
          lotsDeleted: result.lotsDeleted,
          otherParticipantsRemoved: result.otherParticipantsRemoved,
        },
        { headers: noStoreHeaders() },
      );
    }

    if (url.searchParams.get("permanent") === "1") {
      const result = await deleteUnusedInvestor(id);
      if (result === "has_history") {
        return NextResponse.json(
          {
            error:
              "Este investidor já possui histórico. Para um cadastro criado apenas em testes, use ‘Excluir tudo (teste)’.",
          },
          { status: 409, headers: noStoreHeaders() },
        );
      }
      if (result === "not_found") {
        return NextResponse.json(
          { error: "Investidor não encontrado." },
          { status: 404, headers: noStoreHeaders() },
        );
      }

      await writeAudit({
        request,
        action: "investor.delete",
        resourceType: "investor",
        resourceId: id,
        metadata: { adminName: session.displayName },
      });

      return NextResponse.json(
        { ok: true, deleted: true },
        { headers: noStoreHeaders() },
      );
    }

    const changed = await archiveInvestor({
      investorId: id,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investor.archive",
      resourceType: "investor",
      resourceId: id,
      metadata: { changed, adminName: session.displayName },
    });

    return NextResponse.json(
      { ok: true, changed },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover investidor." },
      { status: securityStatus(error, 400), headers: noStoreHeaders() },
    );
  }
}
