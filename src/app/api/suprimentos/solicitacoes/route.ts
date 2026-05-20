import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar solicitacoes." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da solicitacao de compra." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          number: input.number.trim().toUpperCase(),
          requesterId: session.userId,
          department: input.department?.trim() || null,
          costCenter: input.costCenter?.trim() || null,
          priority: input.priority,
          neededAt: input.neededAt || null,
          justification: input.justification?.trim() || null,
          items: {
            create: {
              itemId: input.itemId,
              quantity: new Prisma.Decimal(input.quantity),
              note: input.note?.trim() || null
            }
          }
        },
        include: {
          requester: true,
          items: {
            include: {
              item: {
                include: {
                  unit: true
                }
              }
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CREATE,
          entity: "PurchaseRequest",
          entityId: created.id,
          newValue: {
            number: created.number,
            priority: created.priority,
            status: created.status,
            itemCount: created.items.length
          }
        }
      });

      return created;
    });

    return NextResponse.json({ request: requestRecord }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma solicitacao com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel criar a solicitacao." }, { status: 500 });
  }
}
