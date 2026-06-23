import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { financialSettlementTypeSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = financialSettlementTypeSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do tipo de baixa.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const settlementType = await prisma.financialSettlementType.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "FinancialSettlementType",
        entityId: settlementType.id,
        newValue: settlementType
      }
    }).catch(() => null);

    return apiSuccess({ settlementType }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe tipo de baixa com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel salvar o tipo de baixa.", {
      context: {
        request,
        module: "Cadastros",
        action: "salvar_tipo_baixa",
        userId: session.userId,
        entity: "FinancialSettlementType"
      },
      event: "financial_settlement_type_save_error"
    });
  }
}
