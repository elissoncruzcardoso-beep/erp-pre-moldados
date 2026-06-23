import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { accountPayableSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para criar contas a pagar."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = accountPayableSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da conta a pagar.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const payable = await serializableTransaction(prisma, async (tx) => {
      const receipt = await tx.purchaseReceipt.findUnique({
        where: { id: input.purchaseReceiptId },
        include: {
          accountPayable: true,
          purchaseOrder: {
            include: {
              supplier: true
            }
          },
          purchaseOrderItem: {
            include: {
              item: true
            }
          }
        }
      });

      if (!receipt) {
        throw new Error("RECEIPT_NOT_FOUND");
      }

      if (receipt.status === "CANCELADO") {
        throw new Error("RECEIPT_CANCELED");
      }

      if (receipt.accountPayable) {
        throw new Error("PAYABLE_ALREADY_EXISTS");
      }

      if (receipt.acceptedQuantity.lessThanOrEqualTo(0)) {
        throw new Error("RECEIPT_WITHOUT_VALUE");
      }

      const created = await tx.accountPayable.create({
        data: {
          number: normalizeManualCode(input.number) || makeAutomaticCode("CP"),
          purchaseReceiptId: receipt.id,
          supplierId: receipt.purchaseOrder.supplierId,
          createdById: session.userId,
          description: `NF ${receipt.invoiceNumber || receipt.number} - ${receipt.purchaseOrderItem.item.description}`,
          documentNumber: receipt.invoiceNumber || receipt.number,
          costCenter: input.costCenter?.trim() || null,
          dueDate: input.dueDate,
          amount: receipt.totalCost,
          note: input.note?.trim() || null
        },
        include: {
          supplier: true,
          purchaseReceipt: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Financeiro",
          action: AuditAction.CREATE,
          entity: "AccountPayable",
          entityId: created.id,
          newValue: {
            number: created.number,
            supplier: created.supplier.name,
            receipt: created.purchaseReceipt.number,
            dueDate: created.dueDate.toISOString(),
            amount: created.amount.toString(),
            status: created.status
          }
        }
      });

      return created;
    });

    return apiSuccess({ payable }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma conta a pagar com este numero ou recebimento.");
    }

    const messages: Record<string, string> = {
      RECEIPT_NOT_FOUND: "Recebimento nao encontrado.",
      RECEIPT_CANCELED: "Recebimento cancelado nao pode gerar conta a pagar.",
      PAYABLE_ALREADY_EXISTS: "Este recebimento ja possui conta a pagar.",
      RECEIPT_WITHOUT_VALUE: "Recebimento sem quantidade aceita nao gera conta a pagar."
    };

    const message =
      error instanceof Error && messages[error.message]
        ? messages[error.message]
        : "Nao foi possivel criar a conta a pagar.";

    return handleApiError(new Error(message), "Nao foi possivel criar a conta a pagar.", {
      context: {
        request,
        module: "Financeiro",
        action: "criar_conta_pagar",
        userId: session.userId,
        entity: "AccountPayable"
      },
      event: "account_payable_error"
    });
  }
}
