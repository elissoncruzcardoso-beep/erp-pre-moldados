import { NextResponse } from "next/server";
import { AuditAction, Prisma, type Warehouse } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { stockMovementSchema } from "@/lib/validations/stock";

const positiveTypes = new Set(["ENTRADA_COMPRA", "ENTRADA_PRODUCAO", "AJUSTE_POSITIVO", "ESTORNO"]);
const negativeTypes = new Set(["SAIDA_PRODUCAO", "AJUSTE_NEGATIVO"]);

async function getBalanceForUpdate(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouseId: string,
  lotId: string | null
) {
  return tx.stockBalance.findFirst({
    where: {
      itemId,
      warehouseId,
      lotId
    }
  });
}

async function addBalance(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouseId: string,
  quantity: Prisma.Decimal,
  lotId: string | null
) {
  const currentBalance = await getBalanceForUpdate(tx, itemId, warehouseId, lotId);

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: currentBalance.quantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId,
      lotId,
      quantity
    }
  });
}

async function subtractBalance(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouse: Warehouse,
  quantity: Prisma.Decimal,
  lotId: string | null
) {
  const currentBalance = await getBalanceForUpdate(tx, itemId, warehouse.id, lotId);
  const availableQuantity = currentBalance?.quantity ?? new Prisma.Decimal(0);
  const nextQuantity = availableQuantity.minus(quantity);

  if (!warehouse.allowsNegative && nextQuantity.lessThan(0)) {
    throw new Error("Saldo insuficiente para esta movimentacao.");
  }

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: nextQuantity }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId: warehouse.id,
      lotId,
      quantity: nextQuantity
    }
  });
}

async function reserveBalance(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouse: Warehouse,
  quantity: Prisma.Decimal,
  lotId: string | null
) {
  const currentBalance = await getBalanceForUpdate(tx, itemId, warehouse.id, lotId);
  const stockQuantity = currentBalance?.quantity ?? new Prisma.Decimal(0);
  const reservedQuantity = currentBalance?.reserved ?? new Prisma.Decimal(0);
  const availableQuantity = stockQuantity.minus(reservedQuantity);

  if (!warehouse.allowsNegative && availableQuantity.minus(quantity).lessThan(0)) {
    throw new Error("Saldo disponivel insuficiente para reservar.");
  }

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { reserved: reservedQuantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId: warehouse.id,
      lotId,
      reserved: quantity
    }
  });
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("estoque.move") && !session.permissions.includes("estoque.adjust")) {
    return NextResponse.json({ error: "Voce nao tem permissao para movimentar estoque." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = stockMovementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da movimentacao." }, { status: 400 });
  }

  const input = parsed.data;

  if ((negativeTypes.has(input.type) || input.type === "RESERVA" || input.type === "TRANSFERENCIA") && !input.originWarehouseId) {
    return NextResponse.json({ error: "Informe o deposito de origem." }, { status: 400 });
  }

  if ((positiveTypes.has(input.type) || input.type === "TRANSFERENCIA") && !input.targetWarehouseId) {
    return NextResponse.json({ error: "Informe o deposito de destino." }, { status: 400 });
  }

  const prisma = getPrisma();
  const quantity = new Prisma.Decimal(input.quantity);
  const unitCost = new Prisma.Decimal(input.unitCost ?? 0);
  const totalCost = quantity.mul(unitCost);
  const lotId = input.lotId || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
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

      if (input.type === "TRANSFERENCIA") {
        await subtractBalance(tx as ReturnType<typeof getPrisma>, input.itemId, originWarehouse as Warehouse, quantity, lotId);
        await addBalance(tx as ReturnType<typeof getPrisma>, input.itemId, targetWarehouse?.id as string, quantity, lotId);
      } else if (input.type === "RESERVA") {
        await reserveBalance(tx as ReturnType<typeof getPrisma>, input.itemId, originWarehouse as Warehouse, quantity, lotId);
      } else if (positiveTypes.has(input.type)) {
        await addBalance(tx as ReturnType<typeof getPrisma>, input.itemId, targetWarehouse?.id as string, quantity, lotId);
      } else if (negativeTypes.has(input.type)) {
        await subtractBalance(tx as ReturnType<typeof getPrisma>, input.itemId, originWarehouse as Warehouse, quantity, lotId);
      }

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

    return NextResponse.json({ movement: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel registrar a movimentacao.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
