import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { customerSchema } from "@/lib/validations/cadastros";

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
  const parsed = customerSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do cliente.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "Customer",
        entityId: customer.id,
        newValue: customer
      }
    }).catch(() => null);

    return apiSuccess({ customer });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe cliente com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar o cliente.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_cliente",
        userId: auth.session.userId,
        entity: "Customer"
      },
      event: "customer_update_error"
    });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();
  const current = await prisma.customer.findUnique({ where: { id } });

  if (!current) {
    return apiError("Cliente nao encontrado.", { status: 404 });
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: { active: !current.active }
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.userId,
      module: "Cadastros",
      action: AuditAction.UPDATE,
      entity: "Customer",
      entityId: customer.id,
      newValue: { active: customer.active }
    }
  }).catch(() => null);

  return apiSuccess({ customer });
}
