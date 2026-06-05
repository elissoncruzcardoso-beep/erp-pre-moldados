import { AuditAction } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { accountPayableUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para editar contas a pagar."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = accountPayableUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da conta a pagar.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.accountPayable.findUnique({
        where: { id },
        include: { supplier: true, payments: true, purchaseReceipt: true }
      });

      if (!current) {
        throw new Error("PAYABLE_NOT_FOUND");
      }

      const payable = await tx.accountPayable.update({
        where: { id },
        data: {
          dueDate: input.dueDate,
          costCenter: input.costCenter?.trim() || null,
          note: input.note?.trim() || null
        },
        include: { supplier: true, purchaseReceipt: true }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Financeiro",
          action: AuditAction.UPDATE,
          entity: "AccountPayable",
          entityId: payable.id,
          previousValue: {
            number: current.number,
            supplier: current.supplier.name,
            dueDate: current.dueDate.toISOString(),
            amount: current.amount.toString(),
            status: current.status
          },
          newValue: {
            number: payable.number,
            supplier: payable.supplier.name,
            dueDate: payable.dueDate.toISOString(),
            amount: payable.amount.toString(),
            status: payable.status
          }
        }
      });

      return payable;
    });

    return apiSuccess({ payable: updated });
  } catch (error) {
    const messages: Record<string, string> = {
      PAYABLE_NOT_FOUND: "Conta a pagar nao encontrada."
    };

    const message = error instanceof Error ? messages[error.message] : null;
    if (message) return apiError(message, { status: 404, code: "NOT_FOUND" });

    return handleApiError(error, "Nao foi possivel editar a conta a pagar.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para excluir contas a pagar."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const canForceDelete = ["Administrador", "Diretoria"].includes(auth.session.role);

  try {
    const current = await prisma.accountPayable.findUnique({
      where: { id },
      include: { supplier: true, payments: true, purchaseReceipt: true }
    });

    if (!current) {
      return apiError("Conta a pagar nao encontrada.", { status: 404, code: "NOT_FOUND" });
    }

    if (current.purchaseReceiptId && !canForceDelete) {
      return apiConflict("Conta a pagar gerada por recebimento/NF nao pode ser excluida. Estorne a nota fiscal para manter a rastreabilidade.");
    }

    if ((current.payments.length > 0 || current.paidAmount.greaterThan(0)) && !canForceDelete) {
      return apiConflict("Conta a pagar com baixa financeira nao pode ser excluida.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountPayable.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Financeiro",
          action: AuditAction.DELETE,
          entity: "AccountPayable",
          entityId: current.id,
          previousValue: {
            number: current.number,
            supplier: current.supplier.name,
            dueDate: current.dueDate.toISOString(),
            amount: current.amount.toString(),
            status: current.status,
            forcedByRole: canForceDelete,
            linkedReceipt: Boolean(current.purchaseReceiptId),
            payments: current.payments.length
          }
        }
      });
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel excluir a conta a pagar.");
  }
}
