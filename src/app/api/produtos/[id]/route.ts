import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { calculateBatchReadyAt } from "@/lib/production/auto-release-cured-batches";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const productUpdateSchema = z.object({
  curingHours: z.coerce.number().int().min(0).max(720).optional()
});

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("produtos.manage") && !session.permissions.includes("cadastros.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para alterar produtos." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = productUpdateSchema.safeParse(body);

  if (!parsed.success || parsed.data.curingHours === undefined) {
    return NextResponse.json({ error: "Informe um tempo de cura valido." }, { status: 400 });
  }

  const prisma = getPrisma();
  const curingHours = parsed.data.curingHours;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.item.findUnique({ where: { id } });

      if (!current) {
        throw new Error("Produto nao encontrado.");
      }

      if (current.type !== "PECA_PRE_MOLDADA" && current.type !== "PRODUTO_ACABADO") {
        throw new Error("Tempo de cura so pode ser alterado para peca pre-moldada ou produto acabado.");
      }

      const item = await tx.item.update({
        where: { id },
        data: {
          curingHours
        }
      });

      const openBatches = await tx.productionBatch.findMany({
        where: {
          itemId: id,
          status: { in: ["EM_CURA", "RETIRADA_PARCIAL"] },
          autoStockedAt: null
        },
        select: {
          id: true,
          producedAt: true
        }
      });

      for (const batch of openBatches) {
        await tx.productionBatch.update({
          where: { id: batch.id },
          data: {
            readyAt: calculateBatchReadyAt(batch.producedAt, curingHours)
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Produtos",
          action: AuditAction.UPDATE,
          entity: "Item",
          entityId: item.id,
          previousValue: {
            curingHours: current.curingHours
          },
          newValue: {
            curingHours: item.curingHours,
            recalculatedOpenBatches: openBatches.length
          }
        }
      });

      return { item, recalculatedOpenBatches: openBatches.length };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel atualizar o produto.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
