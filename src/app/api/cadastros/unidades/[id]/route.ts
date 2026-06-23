import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { unitOfMeasureSchema } from "@/lib/validations/cadastros";

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
  const parsed = unitOfMeasureSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da unidade de medida.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const previous = await prisma.unitOfMeasure.findUnique({ where: { id } });

    if (!previous) {
      return apiError("Unidade de medida nao encontrada.", { status: 404 });
    }

    const unit = await prisma.unitOfMeasure.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "UnitOfMeasure",
        entityId: unit.id,
        previousValue: previous,
        newValue: unit
      }
    }).catch(() => null);

    return apiSuccess({ unit });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma unidade com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar a unidade.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_unidade_medida",
        userId: auth.session.userId,
        entity: "UnitOfMeasure"
      },
      event: "unit_of_measure_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const unit = await prisma.unitOfMeasure.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });

    if (!unit) {
      return apiError("Unidade de medida nao encontrada.", { status: 404 });
    }

    if (unit._count.items > 0) {
      return apiConflict("Esta unidade esta em uso por produtos e nao pode ser excluida.");
    }

    await prisma.unitOfMeasure.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.DELETE,
        entity: "UnitOfMeasure",
        entityId: id,
        previousValue: {
          code: unit.code,
          name: unit.name,
          decimals: unit.decimals
        }
      }
    }).catch(() => null);

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel excluir a unidade.", {
      context: {
        request,
        module: "Cadastros",
        action: "excluir_unidade_medida",
        userId: auth.session.userId,
        entity: "UnitOfMeasure"
      },
      event: "unit_of_measure_delete_error"
    });
  }
}
