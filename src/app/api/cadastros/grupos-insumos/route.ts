import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { inputGroupSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = inputGroupSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do grupo de insumos.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const group = await prisma.inputGroup.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        type: input.type,
        defaultFinancialGroupId: input.defaultFinancialGroupId || null,
        controlsStock: input.controlsStock,
        active: input.active,
        note: input.note || null
      },
      create: {
        code: input.code,
        name: input.name,
        type: input.type,
        defaultFinancialGroupId: input.defaultFinancialGroupId || null,
        controlsStock: input.controlsStock,
        active: input.active,
        note: input.note || null
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "InputGroup",
        entityId: group.id,
        newValue: group
      }
    }).catch(() => null);

    return apiSuccess({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um grupo com este codigo ou nome.");
    }

    return handleApiError(error, "Nao foi possivel salvar o grupo de insumos.");
  }
}
