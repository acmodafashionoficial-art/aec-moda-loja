import { NextResponse } from "next/server";
import { cancelInStoreSale } from "@/lib/inventory-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import {
  noStoreHeaders,
  readJson,
  securityStatus,
} from "@/lib/security/request";
import { isUuid } from "@/lib/security/validation";

type CancelBody = {
  reason?: unknown;
};

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAdminMutation(request);
    const { id } = await context.params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "Venda inválida." },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const body = await readJson<CancelBody>(request, 16 * 1024);
    const reason = String(body.reason || "").trim().slice(0, 500);

    const cancelled = await cancelInStoreSale({
      saleId: id,
      reason,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "inventory.store_sale.cancel",
      resourceType: "in_store_sale",
      resourceId: id,
      metadata: {
        reason,
        cancelled,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(
      { cancelled },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao cancelar a venda presencial.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}
