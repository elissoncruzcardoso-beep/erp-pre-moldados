import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { supplierSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do fornecedor.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const supplier = await prisma.supplier.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
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

    return apiSuccess({ supplier }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe fornecedor com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel salvar o fornecedor.", {
      context: {
        request,
        module: "Cadastros",
        action: "salvar_fornecedor",
        userId: auth.session.userId,
        entity: "Supplier"
      },
      event: "supplier_save_error"
    });
  }
}
