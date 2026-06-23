import { AuditAction, Prisma } from "@prisma/client";
import { apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { increaseStockBalance } from "@/lib/stock/transactions";
import { productionBatchReleaseSchema } from "@/lib/validations/production";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession({
    permission: "producao.manage",
    forbiddenMessage: "Voce nao tem permissao para liberar lote."
  });

  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = productionBatchReleaseSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos de liberacao do lote.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const batch = await tx.productionBatch.findUnique({
        where: { id },
        include: {
          item: true
        }
      });

      if (!batch || batch.status === "RETIRADA_TOTAL" || batch.status === "BLOQUEADA") {
        throw new Error("Lote invalido para liberacao.");
      }

      const releaseQuantity = new Prisma.Decimal(input.releasedQuantity);

      if (releaseQuantity.greaterThan(batch.curingQuantity)) {
        throw new Error("Quantidade liberada maior que a quantidade em cura.");
      }

      const finishedWarehouse = await tx.warehouse.findUnique({ where: { code: "PA" } });

      if (!finishedWarehouse || !finishedWarehouse.active) {
        throw new Error("Deposito de produto acabado PA nao encontrado ou inativo.");
      }

      const nextCuringQuantity = batch.curingQuantity.minus(releaseQuantity);
      const nextReleasedQuantity = batch.releasedQuantity.plus(releaseQuantity);
      const nextStatus = nextCuringQuantity.equals(0) ? "APTA_RETIRADA" : "RETIRADA_PARCIAL";
      const productionLot = await tx.lot.upsert({
        where: { code: batch.code },
        update: {
          itemId: batch.itemId,
          manufacturedAt: batch.producedAt,
          status: "LIBERADO"
        },
        create: {
          code: batch.code,
          itemId: batch.itemId,
          manufacturedAt: batch.producedAt,
          status: "LIBERADO"
        }
      });
      const unitCost = batch.item.standardCost;
      const totalCost = releaseQuantity.mul(unitCost);

      const updated = await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          curingQuantity: nextCuringQuantity,
          releasedQuantity: nextReleasedQuantity,
          status: nextStatus,
          releasedAt: new Date(),
          releasedById: auth.session.userId,
          releaseResponsible: input.releaseResponsible.trim(),
          releaseNote: input.releaseNote?.trim() || null
        }
      });

      await increaseStockBalance(tx, batch.itemId, finishedWarehouse.id, releaseQuantity, productionLot.id);

      await tx.stockMovement.create({
        data: {
          type: "ENTRADA_PRODUCAO",
          itemId: batch.itemId,
          quantity: releaseQuantity,
          unitCost,
          totalCost,
          targetWarehouseId: finishedWarehouse.id,
          lotId: productionLot.id,
          userId: auth.session.userId,
          document: batch.code,
          justification: `Liberacao de lote de producao ${batch.code} para retirada.`
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Producao",
          action: AuditAction.UPDATE,
          entity: "ProductionBatch",
          entityId: batch.id,
          previousValue: {
            status: batch.status,
            curingQuantity: batch.curingQuantity.toString(),
            releasedQuantity: batch.releasedQuantity.toString()
          },
          newValue: {
            status: updated.status,
            releasedQuantity: releaseQuantity.toString(),
            releaseResponsible: updated.releaseResponsible,
            releaseNote: updated.releaseNote,
            stockMovement: "ENTRADA_PRODUCAO",
            warehouse: finishedWarehouse.code,
            lot: productionLot.code
          }
        }
      });

      return updated;
    });

    return apiSuccess({ batch: result });
  } catch (error) {
    const messages: Record<string, string> = {
      "Lote invalido para liberacao.": "Lote invalido para liberacao.",
      "Quantidade liberada maior que a quantidade em cura.": "Quantidade liberada maior que a quantidade em cura.",
      "Deposito de produto acabado PA nao encontrado ou inativo.": "Deposito de produto acabado PA nao encontrado ou inativo."
    };
    const message =
      error instanceof Error && messages[error.message]
        ? messages[error.message]
        : "Nao foi possivel liberar o lote.";
    return handleApiError(error, message, {
      context: {
        request,
        module: "Producao",
        action: "liberar_lote",
        userId: auth.session.userId,
        entity: "ProductionBatch"
      },
      event: "production_batch_release_error"
    });
  }
}
