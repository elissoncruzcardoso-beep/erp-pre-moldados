import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { consumeApprovedCompositionForProduction } from "@/lib/production/consume-composition";
import { productionNoteSchema } from "@/lib/validations/production";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("producao.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para apontar producao." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = productionNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do apontamento." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const producedQuantity = new Prisma.Decimal(input.producedQuantity);
  const lossQuantity = new Prisma.Decimal(input.lossQuantity);
  const scrapQuantity = new Prisma.Decimal(input.scrapQuantity);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUnique({
        where: { id: input.productionOrderId },
        include: {
          product: true,
          stages: { orderBy: { sequence: "asc" } }
        }
      });

      if (!order || ["ENCERRADA", "CANCELADA"].includes(order.status)) {
        throw new Error("OP invalida para apontamento.");
      }

      const note = await tx.productionNote.create({
        data: {
          productionOrderId: input.productionOrderId,
          userId: session.userId,
          stage: input.stage,
          producedQuantity,
          lossQuantity,
          scrapQuantity,
          downtimeMinutes: input.downtimeMinutes,
          note: input.note?.trim() || null
        }
      });

      const nextProducedQuantity = order.producedQuantity.plus(producedQuantity);
      const nextStatus = order.status === "PLANEJADA" || order.status === "LIBERADA" ? "EM_PRODUCAO" : order.status;
      const consumptionSummary = producedQuantity.greaterThan(0)
        ? await consumeApprovedCompositionForProduction(tx, {
            productId: order.productId,
            producedQuantity,
            userId: session.userId,
            document: order.number,
            productionOrderId: order.id,
            justification: `Consumo automatico pela ficha tecnica no apontamento da OP ${order.number}.`
          })
        : null;

      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          producedQuantity: nextProducedQuantity,
          status: nextStatus
        }
      });

      if (input.finishStage) {
        const currentStage = order.stages.find((stage) => stage.name === input.stage);
        const nextStage = currentStage
          ? order.stages.find((stage) => stage.sequence === currentStage.sequence + 1)
          : null;

        if (currentStage) {
          await tx.productionStage.update({
            where: { id: currentStage.id },
            data: {
              status: "CONCLUIDA",
              finishedAt: new Date()
            }
          });
        }

        if (nextStage) {
          await tx.productionStage.update({
            where: { id: nextStage.id },
            data: {
              status: "EM_ANDAMENTO",
              startedAt: nextStage.startedAt || new Date()
            }
          });
        } else if (nextProducedQuantity.greaterThanOrEqualTo(order.plannedQuantity)) {
          await tx.productionOrder.update({
            where: { id: order.id },
            data: { status: "AGUARDANDO_QUALIDADE" }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Producao",
          action: AuditAction.UPDATE,
          entity: "ProductionNote",
          entityId: note.id,
          newValue: {
            productionOrderId: note.productionOrderId,
            stage: note.stage,
            producedQuantity: note.producedQuantity.toString(),
            lossQuantity: note.lossQuantity.toString(),
            scrapQuantity: note.scrapQuantity.toString(),
            downtimeMinutes: note.downtimeMinutes,
            finishStage: input.finishStage,
            compositionConsumption: consumptionSummary
          }
        }
      });

      return note;
    });

    return NextResponse.json({ note: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel registrar o apontamento.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
