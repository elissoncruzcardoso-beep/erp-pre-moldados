import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { accountReceivableUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para editar contas a receber."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = accountReceivableUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da conta a receber.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.accountReceivable.findUnique({
        where: { id },
        include: { customer: true, receipts: true, directSale: true }
      });

      if (!current) {
        throw new Error("RECEIVABLE_NOT_FOUND");
      }

      const hasProcessLock = Boolean(current.directSaleId);
      const hasFinancialMovement = current.receipts.length > 0 || current.receivedAmount.greaterThan(0);
      const amountChanged = !current.amount.equals(new Prisma.Decimal(input.amount));
      const customerChanged = current.customerId !== input.customerId;

      if ((hasProcessLock || hasFinancialMovement) && (amountChanged || customerChanged)) {
        throw new Error("RECEIVABLE_LINKED_EDIT_LOCKED");
      }

      const receivable = await tx.accountReceivable.update({
        where: { id },
        data: {
          customerId: input.customerId,
          description: input.description.trim(),
          documentNumber: input.documentNumber?.trim() || null,
          costCenter: input.costCenter?.trim() || null,
          dueDate: input.dueDate,
          amount: new Prisma.Decimal(input.amount),
          note: input.note?.trim() || null
        },
        include: { customer: true, directSale: true }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Financeiro",
          action: AuditAction.UPDATE,
          entity: "AccountReceivable",
          entityId: receivable.id,
          previousValue: {
            number: current.number,
            customer: current.customer.name,
            dueDate: current.dueDate.toISOString(),
            amount: current.amount.toString(),
            status: current.status
          },
          newValue: {
            number: receivable.number,
            customer: receivable.customer.name,
            dueDate: receivable.dueDate.toISOString(),
            amount: receivable.amount.toString(),
            status: receivable.status
          }
        }
      });

      return receivable;
    });

    return apiSuccess({ receivable: updated });
  } catch (error) {
    const messages: Record<string, string> = {
      RECEIVABLE_NOT_FOUND: "Conta a receber nao encontrada.",
      RECEIVABLE_LINKED_EDIT_LOCKED: "Titulo vinculado a venda ou baixa nao permite alterar cliente ou valor."
    };

    const message = error instanceof Error ? messages[error.message] : null;
    if (message) return apiConflict(message);

    return handleApiError(error, "Nao foi possivel editar a conta a receber.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para excluir contas a receber."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const current = await prisma.accountReceivable.findUnique({
      where: { id },
      include: { customer: true, receipts: true, directSale: true }
    });

    if (!current) {
      return apiError("Conta a receber nao encontrada.", { status: 404, code: "NOT_FOUND" });
    }

    if (current.directSaleId) {
      return apiConflict("Conta a receber gerada por venda direta nao pode ser excluida. Cancele a venda para manter a rastreabilidade.");
    }

    if (current.receipts.length > 0 || current.receivedAmount.greaterThan(0)) {
      return apiConflict("Conta a receber com baixa financeira nao pode ser excluida.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountReceivable.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Financeiro",
          action: AuditAction.DELETE,
          entity: "AccountReceivable",
          entityId: current.id,
          previousValue: {
            number: current.number,
            customer: current.customer.name,
            dueDate: current.dueDate.toISOString(),
            amount: current.amount.toString(),
            status: current.status
          }
        }
      });
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel excluir a conta a receber.");
  }
}
