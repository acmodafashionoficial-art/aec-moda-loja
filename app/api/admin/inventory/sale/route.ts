import { NextResponse } from "next/server";
import {
  registerInStoreSale,
  type InventoryPaymentMethod,
} from "@/lib/inventory-repository";
import { writeAudit } from "@/lib/security/audit";
import { requireAdminMutation } from "@/lib/security/admin-request";
import {
  noStoreHeaders,
  readJson,
  securityStatus,
} from "@/lib/security/request";

type SaleBody = {
  code?: unknown;
  paymentMethod?: unknown;
};

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    const body = await readJson<SaleBody>(request, 16 * 1024);

    const code = String(body.code || "").trim();
    const paymentMethod = String(
      body.paymentMethod || "",
    ) as InventoryPaymentMethod;

    const sale = await registerInStoreSale({
      code,
      paymentMethod,
      actorId: session.id,
      actorEmail: session.email,
    });

    await writeAudit({
      request,
      action: "inventory.store_sale",
      resourceType: "in_store_sale",
      resourceId: sale.saleId,
      metadata: {
        publicCode: sale.salePublicCode,
        unitCode: sale.unitCode,
        productName: sale.productName,
        sku: sale.sku,
        size: sale.size,
        color: sale.color,
        paymentMethod,
        total: sale.unitPrice,
        adminName: session.displayName,
      },
    });

    return NextResponse.json(
      { sale },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao registrar a venda presencial.",
      },
      {
        status: securityStatus(error, 400),
        headers: noStoreHeaders(),
      },
    );
  }
}
