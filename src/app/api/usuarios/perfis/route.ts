import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { roleSchema } from "@/lib/validations/role";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "usuarios.manage",
    forbiddenMessage: "Você não tem permissão para criar perfis."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = roleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise nome, descrição e permissões do perfil.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const permissions = await prisma.permission.findMany({
    where: { id: { in: parsed.data.permissionIds } }
  });

  if (permissions.length !== parsed.data.permissionIds.length) {
    return apiError("Uma ou mais permissões informadas não existem.", { status: 400 });
  }

  try {
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description || null
        }
      });

      await tx.rolePermission.createMany({
        data: parsed.data.permissionIds.map((permissionId) => ({
          roleId: created.id,
          permissionId
        })),
        skipDuplicates: true
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Usuarios",
          action: AuditAction.PERMISSION_CHANGE,
          entity: "Role",
          entityId: created.id,
          newValue: {
            id: created.id,
            name: created.name,
            permissions: permissions.map((permission) => permission.key)
          }
        }
      });

      return created;
    });

    return apiSuccess({ role }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Já existe perfil com este nome.");
    }

    return handleApiError(error, "Não foi possível criar o perfil.");
  }
}
