import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { financialSettlementTypeSchema } from "@/lib/validations/cadastros";

async function requireManageSession() {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return { error: auth.response };

  return { session: auth.session };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = financialSettlementTypeSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do tipo de baixa.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const settlementType = await prisma.financialSettlementType.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "FinancialSettlementType",
        entityId: settlementType.id,
        newValue: settlementType
      }
    }).catch(() => null);

    return apiSuccess({ settlementType });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe tipo de baixa com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar o tipo de baixa.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_tipo_baixa",
        userId: auth.session.userId,
        entity: "FinancialSettlementType"
      },
      event: "financial_settlement_type_update_error"
    });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();
  const current = await prisma.financialSettlementType.findUnique({ where: { id } });

  if (!current) {
    return apiError("Tipo de baixa nao encontrado.", { status: 404 });
  }

  const settlementType = await prisma.financialSettlementType.update({
    where: { id },
    data: { active: !current.active }
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.userId,
      module: "Cadastros",
      action: AuditAction.UPDATE,
      entity: "FinancialSettlementType",
      entityId: settlementType.id,
      newValue: { active: settlementType.active }
    }
  }).catch(() => null);

  return apiSuccess({ settlementType });
}
