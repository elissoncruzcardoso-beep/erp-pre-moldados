import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { accountReceivableSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "financeiro.manage",
    forbiddenMessage: "Voce nao tem permissao para criar contas a receber."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = accountReceivableSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da conta a receber.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const receivable = await prisma.accountReceivable.create({
      data: {
        number: normalizeManualCode(input.number) || makeAutomaticCode("CR"),
        customerId: input.customerId,
        createdById: session.userId,
        description: input.description.trim(),
        documentNumber: input.documentNumber?.trim() || null,
        costCenter: input.costCenter?.trim() || null,
        dueDate: input.dueDate,
        amount: new Prisma.Decimal(input.amount),
        note: input.note?.trim() || null
      },
      include: {
        customer: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Financeiro",
        action: AuditAction.CREATE,
        entity: "AccountReceivable",
        entityId: receivable.id,
        newValue: {
          number: receivable.number,
          customer: receivable.customer.name,
          dueDate: receivable.dueDate.toISOString(),
          amount: receivable.amount.toString(),
          status: receivable.status
        }
      }
    });

    return apiSuccess({ receivable }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma conta a receber com este numero.");
    }

    return handleApiError(error, "Nao foi possivel criar a conta a receber.", {
      context: {
        request,
        module: "Financeiro",
        action: "criar_conta_receber",
        userId: session.userId,
        entity: "AccountReceivable"
      },
      event: "account_receivable_error"
    });
  }
}
