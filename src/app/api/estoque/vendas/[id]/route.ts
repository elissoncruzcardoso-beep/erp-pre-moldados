import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { cancelDirectSale } from "@/lib/sales/direct-sale-service";
import { toDecimal } from "@/lib/stock/transactions";

const updateSaleSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerDocument: z.string().trim().max(40).optional(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().trim().max(60).optional(),
  note: z.string().trim().max(240).optional()
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(240).optional()
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession({
    permission: "estoque.move",
    forbiddenMessage: "Voce nao tem permissao para editar recibos."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSaleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os dados do recibo.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const unitPrice = toDecimal(input.unitPrice);
  const discount = toDecimal(input.discount);

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const sale = await tx.directSale.findUnique({ where: { id } });

      if (!sale) {
        throw new Error("Recibo nao encontrado.");
      }

      if (sale.status !== "ATIVA") {
        throw new Error("Recibos cancelados nao podem ser editados.");
      }

      const grossTotal = sale.quantity.mul(unitPrice);
      const finalTotal = grossTotal.minus(discount);

      if (finalTotal.lessThan(0)) {
        throw new Error("O desconto nao pode ser maior que o total bruto.");
      }

      const receivable = await tx.accountReceivable.findFirst({
        where: { directSaleId: sale.id },
        include: { receipts: true }
      });

      if (receivable && receivable.receipts.length > 0 && !receivable.amount.equals(finalTotal)) {
        throw new Error("Este recibo ja possui baixa financeira. Estorne ou ajuste o financeiro antes de alterar o valor.");
      }

      const updated = await tx.directSale.update({
        where: { id },
        data: {
          customerName: input.customerName,
          customerDocument: input.customerDocument || null,
          unitPrice,
          grossTotal,
          discount,
          finalTotal,
          paymentMethod: input.paymentMethod || null,
          note: input.note || null
        }
      });

      if (sale.stockMovementId) {
        await tx.stockMovement.update({
          where: { id: sale.stockMovementId },
          data: {
            unitCost: unitPrice,
            totalCost: finalTotal,
            justification: `Venda direta do estoque para ${input.customerName}`
          }
        });
      }

      if (receivable) {
        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            description: `Venda direta ${updated.number}`,
            documentNumber: updated.number,
            amount: finalTotal,
            note: input.note || null
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Estoque",
          action: AuditAction.UPDATE,
          entity: "DirectSale",
          entityId: id,
          newValue: {
            number: updated.number,
            customerName: updated.customerName,
            unitPrice: updated.unitPrice.toString(),
            discount: updated.discount.toString(),
            finalTotal: updated.finalTotal.toString()
          },
          justification: "Edicao de dados comerciais do recibo"
        }
      });

      return updated;
    });

    return apiSuccess({ sale: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel editar o recibo.", {
      context: {
        request,
        module: "Vendas",
        action: "editar_recibo_venda",
        userId: session.userId,
        entity: "DirectSale"
      },
      event: "direct_sale_update_error"
    });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession({
    permission: "estoque.move",
    forbiddenMessage: "Voce nao tem permissao para cancelar recibos."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = cancelSaleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise o motivo do cancelamento.", parsed.error.flatten());
  }

  try {
    const result = await cancelDirectSale(getPrisma(), id, { userId: session.userId }, parsed.data.reason);

    return apiSuccess({ sale: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel cancelar o recibo.", {
      context: {
        request,
        module: "Vendas",
        action: "cancelar_recibo_venda",
        userId: session.userId,
        entity: "DirectSale"
      },
      event: "direct_sale_cancel_error"
    });
  }
}
