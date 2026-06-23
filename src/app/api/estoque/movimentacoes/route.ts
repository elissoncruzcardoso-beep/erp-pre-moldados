import { AuditAction } from "@prisma/client";
import { apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import {
  applyStockMovementBalance,
  negativeStockMovementTypes,
  positiveStockMovementTypes,
  toDecimal
} from "@/lib/stock/transactions";
import { stockMovementSchema } from "@/lib/validations/stock";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    anyPermission: ["estoque.move", "estoque.adjust"],
    forbiddenMessage: "Voce nao tem permissao para movimentar estoque."
  });

  if (auth.response) return auth.response;

  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = stockMovementSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da movimentacao.", parsed.error.flatten());
  }

  const input = parsed.data;

  if ((negativeStockMovementTypes.has(input.type) || input.type === "RESERVA" || input.type === "TRANSFERENCIA") && !input.originWarehouseId) {
    return apiError("Informe o deposito de origem.");
  }

  if ((positiveStockMovementTypes.has(input.type) || input.type === "TRANSFERENCIA") && !input.targetWarehouseId) {
    return apiError("Informe o deposito de destino.");
  }

  const prisma = getPrisma();
  const quantity = toDecimal(input.quantity);
  const unitCost = toDecimal(input.unitCost ?? 0);
  const totalCost = quantity.mul(unitCost);
  const lotId = input.lotId || null;

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });

      if (!item || !item.active || !item.controlsStock) {
        throw new Error("Item invalido para controle de estoque.");
      }

      const [originWarehouse, targetWarehouse] = await Promise.all([
        input.originWarehouseId ? tx.warehouse.findUnique({ where: { id: input.originWarehouseId } }) : null,
        input.targetWarehouseId ? tx.warehouse.findUnique({ where: { id: input.targetWarehouseId } }) : null
      ]);

      if (input.originWarehouseId && !originWarehouse) {
        throw new Error("Deposito de origem invalido.");
      }

      if (input.targetWarehouseId && !targetWarehouse) {
        throw new Error("Deposito de destino invalido.");
      }

      await applyStockMovementBalance(tx, {
        type: input.type,
        itemId: input.itemId,
        quantity,
        originWarehouse,
        targetWarehouse,
        lotId
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: input.type,
          itemId: input.itemId,
          quantity,
          unitCost,
          totalCost,
          originWarehouseId: input.originWarehouseId || null,
          targetWarehouseId: input.targetWarehouseId || null,
          lotId,
          productionOrderId: input.productionOrderId || null,
          userId: session.userId,
          document: input.document?.trim() || null,
          justification: input.justification?.trim() || null
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Estoque",
          action: AuditAction.STOCK_MOVE,
          entity: "StockMovement",
          entityId: movement.id,
          newValue: {
            type: movement.type,
            itemId: movement.itemId,
            quantity: movement.quantity.toString(),
            originWarehouseId: movement.originWarehouseId,
            targetWarehouseId: movement.targetWarehouseId
          },
          justification: movement.justification
        }
      });

      return movement;
    });

    return apiSuccess({ movement: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel registrar a movimentacao.", {
      context: {
        request,
        module: "Estoque",
        action: "registrar_movimentacao",
        userId: session.userId,
        entity: "StockMovement"
      },
      event: "stock_movement_error"
    });
  }
}
