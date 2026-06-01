import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { financialGroupSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = financialGroupSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do grupo financeiro.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const group = await prisma.financialGroup.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        type: input.type,
        category: input.category || null,
        costCenter: input.costCenter || null,
        active: input.active,
        note: input.note || null
      },
      create: {
        code: input.code,
        name: input.name,
        type: input.type,
        category: input.category || null,
        costCenter: input.costCenter || null,
        active: input.active,
        note: input.note || null
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "FinancialGroup",
        entityId: group.id,
        newValue: group
      }
    }).catch(() => null);

    return apiSuccess({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um grupo financeiro com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel salvar o grupo financeiro.");
  }
}
