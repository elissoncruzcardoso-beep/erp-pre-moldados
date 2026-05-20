import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseQuoteSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar cotacoes." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseQuoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da cotacao de precos." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const quote = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.purchaseRequest.findUnique({
        where: { id: input.purchaseRequestId }
      });

      if (!requestRecord) {
        throw new Error("PURCHASE_REQUEST_NOT_FOUND");
      }

      const created = await tx.purchaseQuote.create({
        data: {
          number: input.number.trim().toUpperCase(),
          purchaseRequestId: input.purchaseRequestId,
          supplierId: input.supplierId,
          createdById: session.userId,
          deliveryDays: input.deliveryDays ?? null,
          paymentTerms: input.paymentTerms?.trim() || null,
          validUntil: input.validUntil || null,
          freightCost: new Prisma.Decimal(input.freightCost),
          totalValue: new Prisma.Decimal(input.totalValue),
          note: input.note?.trim() || null
        },
        include: {
          supplier: true,
          purchaseRequest: true,
          createdBy: true
        }
      });

      if (requestRecord.status === "ABERTA") {
        await tx.purchaseRequest.update({
          where: { id: requestRecord.id },
          data: { status: "EM_COTACAO" }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CREATE,
          entity: "PurchaseQuote",
          entityId: created.id,
          newValue: {
            number: created.number,
            purchaseRequest: created.purchaseRequest.number,
            supplier: created.supplier.name,
            totalValue: created.totalValue.toString(),
            status: created.status
          }
        }
      });

      return created;
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PURCHASE_REQUEST_NOT_FOUND") {
      return NextResponse.json({ error: "Solicitacao de compra nao encontrada." }, { status: 404 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma cotacao com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel criar a cotacao." }, { status: 500 });
  }
}
