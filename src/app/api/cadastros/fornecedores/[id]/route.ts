import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { supplierSchema } from "@/lib/validations/cadastros";

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
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do fornecedor.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "Supplier",
        entityId: supplier.id,
        newValue: supplier
      }
    }).catch(() => null);

    return apiSuccess({ supplier });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe fornecedor com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar o fornecedor.", {
      context: {
        request,
        module: "Cadastros",
        action: "atualizar_fornecedor",
        userId: auth.session.userId,
        entity: "Supplier"
      },
      event: "supplier_update_error"
    });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();
  const current = await prisma.supplier.findUnique({ where: { id } });

  if (!current) {
    return apiError("Fornecedor nao encontrado.", { status: 404 });
  }

  const supplier = await prisma.supplier.update({
    where: { id },
    data: { active: !current.active }
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.userId,
      module: "Cadastros",
      action: AuditAction.UPDATE,
      entity: "Supplier",
      entityId: supplier.id,
      newValue: { active: supplier.active }
    }
  }).catch(() => null);

  return apiSuccess({ supplier });
}
