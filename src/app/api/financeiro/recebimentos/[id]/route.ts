import { AccountReceivableStatus, AuditAction, Prisma } from "@prisma/client";
import { apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { accountReceiptReversalSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getStatusAfterReceiptReversal(amount: Prisma.Decimal, receivedAmount: Prisma.Decimal) {
  if (receivedAmount.lessThanOrEqualTo(0)) {
    return AccountReceivableStatus.ABERTO;
  }

  if (receivedAmount.greaterThanOrEqualTo(amount)) {
    return AccountReceivableStatus.RECEBIDO;
  }

  return AccountReceivableStatus.FATURADO;
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para estornar recebimentos."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = accountReceiptReversalSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Informe o motivo do estorno.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const receipt = await tx.accountReceipt.findUnique({
        where: { id },
        include: {
          accountReceivable: {
            include: {
              customer: true,
              receipts: true
            }
          },
          receivedBy: true
        }
      });

      if (!receipt) {
        throw new Error("RECEIPT_NOT_FOUND");
      }

      const receivable = receipt.accountReceivable;
      const nextReceivedAmount = receivable.receipts
        .filter((row) => row.id !== receipt.id)
        .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
      const nextStatus = getStatusAfterReceiptReversal(receivable.amount, nextReceivedAmount);

      await tx.accountReceipt.delete({ where: { id: receipt.id } });

      const updatedReceivable = await tx.accountReceivable.update({
        where: { id: receivable.id },
        data: {
          receivedAmount: nextReceivedAmount,
          receivedAt: nextStatus === AccountReceivableStatus.RECEBIDO ? receivable.receivedAt : null,
          status: nextStatus
        },
        include: { customer: true }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Financeiro",
          action: AuditAction.DELETE,
          entity: "AccountReceipt",
          entityId: receipt.id,
          previousValue: {
            accountReceivableId: receivable.id,
            accountReceivableNumber: receivable.number,
            customer: receivable.customer.name,
            amount: receipt.amount.toString(),
            method: receipt.method,
            reference: receipt.reference,
            receiptDate: receipt.receiptDate.toISOString(),
            reason: parsed.data.reason.trim()
          },
          newValue: {
            accountReceivableId: updatedReceivable.id,
            status: updatedReceivable.status,
            receivedAmount: updatedReceivable.receivedAmount.toString()
          }
        }
      });

      return updatedReceivable;
    });

    return apiSuccess({ receivable: result });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_NOT_FOUND") {
      return apiError("Baixa financeira nao encontrada.", { status: 404, code: "NOT_FOUND" });
    }

    return handleApiError(error, "Nao foi possivel estornar a baixa financeira.", {
      context: {
        request,
        module: "Financeiro",
        action: "estornar_recebimento",
        userId: auth.session.userId,
        entity: "AccountReceipt"
      },
      event: "account_receipt_reversal_error"
    });
  }
}
