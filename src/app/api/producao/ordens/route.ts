import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { productionOrderSchema } from "@/lib/validations/production";

const defaultStages = [
  { name: "Preparacao", sequence: 1 },
  { name: "Armacao", sequence: 2 },
  { name: "Concretagem", sequence: 3 },
  { name: "Cura/Qualidade", sequence: 4 },
  { name: "Liberacao", sequence: 5 }
];

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("producao.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar ordens de producao." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = productionOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos obrigatorios da OP." }, { status: 400 });
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      if (input.compositionId) {
        const composition = await tx.composition.findUnique({
          where: { id: input.compositionId },
          select: {
            productId: true,
            approved: true,
            code: true
          }
        });

        if (!composition || composition.productId !== input.productId) {
          throw new Error("A ficha tecnica selecionada nao pertence ao produto da OP.");
        }

        if (!composition.approved) {
          throw new Error(`A ficha tecnica ${composition.code} ainda nao esta aprovada.`);
        }
      }

      const createdOrder = await tx.productionOrder.create({
        data: {
          number: normalizeManualCode(input.number) || makeAutomaticCode("OP"),
          productId: input.productId,
          compositionId: input.compositionId || null,
          moldId: input.moldId || null,
          customerId: input.customerId || null,
          plannedQuantity: new Prisma.Decimal(input.plannedQuantity),
          expectedDate: input.expectedDate || null,
          status: "PLANEJADA",
          stages: {
            create: defaultStages.map((stage) => ({
              name: stage.name,
              sequence: stage.sequence,
              status: stage.sequence === 1 ? "EM_ANDAMENTO" : "PENDENTE",
              startedAt: stage.sequence === 1 ? new Date() : null
            }))
          }
        },
        include: {
          product: true,
          mold: true,
          stages: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Producao",
          action: AuditAction.CREATE,
          entity: "ProductionOrder",
          entityId: createdOrder.id,
          newValue: {
            number: createdOrder.number,
            productId: createdOrder.productId,
            plannedQuantity: createdOrder.plannedQuantity.toString(),
            status: createdOrder.status
          }
        }
      });

      return createdOrder;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma OP com este numero." }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Nao foi possivel criar a ordem de producao.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
