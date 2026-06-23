import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { paymentMethodSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da forma de pagamento.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const paymentMethod = await prisma.paymentMethod.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "PaymentMethod",
        entityId: paymentMethod.id,
        newValue: paymentMethod
      }
    }).catch(() => null);

    return apiSuccess({ paymentMethod }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe forma de pagamento com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel salvar a forma de pagamento.", {
      context: {
        request,
        module: "Cadastros",
        action: "salvar_forma_pagamento",
        userId: session.userId,
        entity: "PaymentMethod"
      },
      event: "payment_method_save_error"
    });
  }
}
