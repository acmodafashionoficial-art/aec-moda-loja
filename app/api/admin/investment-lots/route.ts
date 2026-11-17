import { NextResponse } from "next/server";
import { createAndActivateInvestmentLot } from "@/lib/investment-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import {
  noStoreHeaders,
  readJson,
  securityStatus,
} from "@/lib/security/request";

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
  distributionMode?: unknown;
  manualOrder?: unknown;
  pieceAssignments?: Array<{
    variantId?: unknown;
    investorId?: unknown;
    quantity?: unknown;
  }>;
};

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
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


    const distributionModeRaw = String(body.distributionMode || "random");
    const distributionMode =
      distributionModeRaw === "manual_order" || distributionModeRaw === "piece_assignment"
        ? distributionModeRaw
        : "random";

    const manualOrder = Array.isArray(body.manualOrder)
      ? body.manualOrder.slice(0, 100).map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    const pieceAssignments = Array.isArray(body.pieceAssignments)
      ? body.pieceAssignments.slice(0, 5000).map((item) => ({
          variantId: String(item?.variantId || "").trim(),
          investorId: String(item?.investorId || "").trim(),
          quantity: Math.floor(Number(item?.quantity) || 0),
        }))
      : [];

    const lotId = await createAndActivateInvestmentLot({
      name,
      participants,
      items,
      distributionMode,
      manualOrder,
      pieceAssignments,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investment_lot.create_activate",
      resourceType: "investment_lot",
      resourceId: lotId,
      metadata: {
        name,
        participantCount: participants.filter((item) => item.units > 0).length,
        itemCount: items.filter((item) => item.quantity > 0).length,
        distributionMode,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(
      { lotId },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao criar e ativar o lote.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}
