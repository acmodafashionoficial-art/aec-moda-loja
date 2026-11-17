import { NextResponse } from "next/server";
import { createInvestor } from "@/lib/investment-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import {
  noStoreHeaders,
  readJson,
  securityStatus,
} from "@/lib/security/request";

type Body = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
};

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    const body = await readJson<Body>(request, 32 * 1024);

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const notes = String(body.notes || "").trim();

    if (name.length < 2) {
      throw new Error("Informe o nome do investidor.");
    }

    const investorId = await createInvestor({
      name,
      email,
      phone,
      notes,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "investor.create",
      resourceType: "investor",
      resourceId: investorId,
      metadata: {
        name,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(
      { investorId },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao cadastrar investidor.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}
