import { NextResponse } from "next/server";
import {
  archiveInvestmentLot,
  updateInvestmentLot,
} from "@/lib/investment-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import {
  noStoreHeaders,
  readJson,
  securityStatus,
} from "@/lib/security/request";

type Props = { params: Promise<{ id: string }> };

type Body = {
  name?: unknown;
  participants?: Array<{
    investorId?: unknown;
    units?: unknown;
  }>;
  items?: Array<{
    variantId?: unknown;
    quantity?: unknown;
  }>;
};

export async function PUT(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;
    const body = await readJson<Body>(request, 128 * 1024);

    const name = String(body.name || "").trim();
    if (name.length < 2) {
      throw new Error("Informe o nome do lote.");
    }

    const participants = Array.isArray(body.participants)
      ? body.participants.slice(0, 100).map((item) => ({
          investorId: String(item?.investorId || "").trim(),
          units: Math.floor(Number(item?.units) || 0),
        }))
      : [];

    const items = Array.isArray(body.items)
      ? body.items.slice(0, 500).map((item) => ({
          variantId: String(item?.variantId || "").trim(),
          quantity: Math.floor(Number(item?.quantity) || 0),
        }))
      : [];

    await updateInvestmentLot({
      lotId: id,
      name,
      participants,
      items,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investment_lot.update",
      resourceType: "investment_lot",
      resourceId: id,
      metadata: {
        name,
        participantCount: participants.filter((item) => item.units > 0).length,
        itemCount: items.filter((item) => item.quantity > 0).length,
        adminName: session.displayName,
      },
    });

    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar o lote.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}

export async function DELETE(request: Request, { params }: Props) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await params;

    await archiveInvestmentLot({
      lotId: id,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investment_lot.archive",
      resourceType: "investment_lot",
      resourceId: id,
      metadata: {
        adminName: session.displayName,
        mode: "safe_archive",
      },
    });

    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao apagar o lote.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}
