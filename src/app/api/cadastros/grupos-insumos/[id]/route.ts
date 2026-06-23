import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { inputGroupSchema } from "@/lib/validations/cadastros";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireManageSession() {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return { error: auth.response };

  return { session: auth.session };
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = inputGroupSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do grupo de insumos.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const previous = await prisma.inputGroup.findUnique({ where: { id } });

    if (!previous) {
      return apiError("Grupo de insumos nao encontrado.", { status: 404 });
    }

    const group = await prisma.inputGroup.update({
      where: { id },
      data: {
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
        previousValue: previous,
        newValue: group
      }
    }).catch(() => null);

    return apiSuccess({ group });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um grupo com este codigo ou nome.");
    }

    return handleApiError(error, "Nao foi possivel atualizar o grupo de insumos.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_grupo_insumos",
        userId: auth.session.userId,
        entity: "InputGroup"
      },
      event: "input_group_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const current = await prisma.inputGroup.findUnique({ where: { id } });

    if (!current) {
      return apiError("Grupo de insumos nao encontrado.", { status: 404 });
    }

    const group = await prisma.inputGroup.update({
      where: { id },
      data: { active: !current.active }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "InputGroup",
        entityId: group.id,
        previousValue: { active: current.active },
        newValue: { active: group.active }
      }
    }).catch(() => null);

    return apiSuccess({ group });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel alterar o status do grupo de insumos.", {
      context: {
        request,
        module: "Cadastros",
        action: "alterar_status_grupo_insumos",
        userId: auth.session.userId,
        entity: "InputGroup"
      },
      event: "input_group_toggle_error"
    });
  }
}
