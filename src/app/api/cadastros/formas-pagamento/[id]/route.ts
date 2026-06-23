import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { paymentMethodSchema } from "@/lib/validations/cadastros";

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
  const parsed = paymentMethodSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da forma de pagamento.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const paymentMethod = await prisma.paymentMethod.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "PaymentMethod",
        entityId: paymentMethod.id,
        newValue: paymentMethod
      }
    }).catch(() => null);

    return apiSuccess({ paymentMethod });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe forma de pagamento com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar a forma de pagamento.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_forma_pagamento",
        userId: auth.session.userId,
        entity: "PaymentMethod"
      },
      event: "payment_method_update_error"
    });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();
  const current = await prisma.paymentMethod.findUnique({ where: { id } });

  if (!current) {
    return apiError("Forma de pagamento nao encontrada.", { status: 404 });
  }

  const paymentMethod = await prisma.paymentMethod.update({
    where: { id },
    data: { active: !current.active }
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.userId,
      module: "Cadastros",
      action: AuditAction.UPDATE,
      entity: "PaymentMethod",
      entityId: paymentMethod.id,
      newValue: { active: paymentMethod.active }
    }
  }).catch(() => null);

  return apiSuccess({ paymentMethod });
}
