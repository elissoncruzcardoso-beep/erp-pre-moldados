import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { customerSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = customerSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do cliente.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const customer = await prisma.customer.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "Customer",
        entityId: customer.id,
        newValue: customer
      }
    }).catch(() => null);

    return apiSuccess({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe cliente com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel salvar o cliente.", {
      context: {
        request,
        module: "Cadastros",
        action: "salvar_cliente",
        userId: session.userId,
        entity: "Customer"
      },
      event: "customer_save_error"
    });
  }
}
