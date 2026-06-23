import { AuditAction } from "@prisma/client";
import { apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import {
  applyStockMovementBalance,
  negativeStockMovementTypes,
  positiveStockMovementTypes,
  reverseStockMovementBalance,
  toDecimal
} from "@/lib/stock/transactions";
import { stockMovementSchema } from "@/lib/validations/stock";

type MovementRouteContext = {
  params: Promise<{ id: string }>;
};

function isLockedMovement(movement: {
  directSale: unknown | null;
  purchaseReceipt: unknown | null;
  productionOrderId: string | null;
}) {
  return Boolean(movement.directSale || movement.purchaseReceipt || movement.productionOrderId);
}

export async function PUT(request: Request, context: MovementRouteContext) {
  const auth = await requireApiSession({
    anyPermission: ["estoque.movements.manage"],
    anyRole: ["Administrador", "Diretoria"],
    forbiddenMessage: "Voce nao tem permissao para editar movimentacoes de estoque."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
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
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: {
          directSale: true,
          purchaseReceipt: true,
          originWarehouse: true,
          targetWarehouse: true
        }
      });

      if (!movement) {
        throw new Error("Movimentacao nao encontrada.");
      }

      if (isLockedMovement(movement)) {
        throw new Error("Movimentacao vinculada a venda, recebimento ou producao nao pode ser editada aqui.");
      }

      const item = await tx.item.findUnique({ where: { id: input.itemId } });

      if (!item || !item.active || !item.controlsStock) {
        throw new Error("Item invalido para controle de estoque.");
      }

      const [newOriginWarehouse, newTargetWarehouse] = await Promise.all([
        input.originWarehouseId ? tx.warehouse.findUnique({ where: { id: input.originWarehouseId } }) : null,
        input.targetWarehouseId ? tx.warehouse.findUnique({ where: { id: input.targetWarehouseId } }) : null
      ]);

      if (input.originWarehouseId && !newOriginWarehouse) {
        throw new Error("Deposito de origem invalido.");
      }

      if (input.targetWarehouseId && !newTargetWarehouse) {
        throw new Error("Deposito de destino invalido.");
      }

      await reverseStockMovementBalance(tx, {
        type: movement.type,
        itemId: movement.itemId,
        quantity: movement.quantity,
        originWarehouse: movement.originWarehouse,
        targetWarehouse: movement.targetWarehouse,
        lotId: movement.lotId
      });

      await applyStockMovementBalance(tx, {
        type: input.type,
        itemId: input.itemId,
        quantity,
        originWarehouse: newOriginWarehouse,
        targetWarehouse: newTargetWarehouse,
        lotId
      });

      const updated = await tx.stockMovement.update({
        where: { id },
        data: {
          type: input.type,
          itemId: input.itemId,
          quantity,
          unitCost,
          totalCost,
          originWarehouseId: input.originWarehouseId || null,
          targetWarehouseId: input.targetWarehouseId || null,
          lotId,
          document: input.document?.trim() || null,
          justification: input.justification?.trim() || null
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Estoque",
          action: AuditAction.UPDATE,
          entity: "StockMovement",
          entityId: updated.id,
          previousValue: {
            type: movement.type,
            itemId: movement.itemId,
            quantity: movement.quantity.toString(),
            originWarehouseId: movement.originWarehouseId,
            targetWarehouseId: movement.targetWarehouseId,
            document: movement.document
          },
          newValue: {
            type: updated.type,
            itemId: updated.itemId,
            quantity: updated.quantity.toString(),
            originWarehouseId: updated.originWarehouseId,
            targetWarehouseId: updated.targetWarehouseId,
            document: updated.document
          },
          justification: updated.justification || "Correcao manual de movimentacao de estoque."
        }
      });

      return updated;
    });

    return apiSuccess({ movement: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel editar a movimentacao.", {
      context: {
        request,
        module: "Estoque",
        action: "editar_movimentacao",
        userId: auth.session.userId,
        entity: "StockMovement"
      },
      event: "stock_movement_update_error"
    });
  }
}

export async function DELETE(request: Request, context: MovementRouteContext) {
  const auth = await requireApiSession({
    anyPermission: ["estoque.movements.manage"],
    anyRole: ["Administrador", "Diretoria"],
    forbiddenMessage: "Voce nao tem permissao para excluir movimentacoes de estoque."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: {
          item: true,
          directSale: true,
          purchaseReceipt: true,
          originWarehouse: true,
          targetWarehouse: true
        }
      });

      if (!movement) {
        throw new Error("Movimentacao nao encontrada.");
      }

      if (isLockedMovement(movement)) {
        throw new Error("Movimentacao vinculada a venda, recebimento ou producao nao pode ser excluida aqui.");
      }

      await reverseStockMovementBalance(tx, {
        type: movement.type,
        itemId: movement.itemId,
        quantity: movement.quantity,
        originWarehouse: movement.originWarehouse,
        targetWarehouse: movement.targetWarehouse,
        lotId: movement.lotId
      });

      await tx.stockMovement.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Estoque",
          action: AuditAction.DELETE,
          entity: "StockMovement",
          entityId: movement.id,
          previousValue: {
            type: movement.type,
            itemId: movement.itemId,
            itemCode: movement.item.code,
            quantity: movement.quantity.toString(),
            originWarehouseId: movement.originWarehouseId,
            targetWarehouseId: movement.targetWarehouseId,
            document: movement.document
          },
          justification: "Exclusao manual de movimentacao de estoque."
        }
      });

      return { id: movement.id };
    });

    return apiSuccess({ movement: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel excluir a movimentacao.", {
      context: {
        request,
        module: "Estoque",
        action: "excluir_movimentacao",
        userId: auth.session.userId,
        entity: "StockMovement"
      },
      event: "stock_movement_delete_error"
    });
  }
}
