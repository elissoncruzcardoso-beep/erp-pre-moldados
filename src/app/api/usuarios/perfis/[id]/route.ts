import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { roleSchema } from "@/lib/validations/role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "usuarios.manage",
    forbiddenMessage: "Você não tem permissão para alterar perfis."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = roleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise nome, descrição e permissões do perfil.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const [current, permissions] = await Promise.all([
    prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } }
      }
    }),
    prisma.permission.findMany({
      where: { id: { in: parsed.data.permissionIds } }
    })
  ]);

  if (!current) {
    return apiError("Perfil não encontrado.", { status: 404 });
  }

  if (permissions.length !== parsed.data.permissionIds.length) {
    return apiError("Uma ou mais permissões informadas não existem.", { status: 400 });
  }

  try {
    const role = await prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description || null
        }
      });

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: parsed.data.permissionIds.map((permissionId) => ({
          roleId: id,
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
          entityId: id,
          previousValue: {
            name: current.name,
            description: current.description,
            permissions: current.permissions.map(({ permission }) => permission.key)
          },
          newValue: {
            name: updated.name,
            description: updated.description,
            permissions: permissions.map((permission) => permission.key)
          }
        }
      });

      return updated;
    });

    return apiSuccess({ role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Já existe perfil com este nome.");
    }

    return handleApiError(error, "Não foi possível atualizar o perfil.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "usuarios.manage",
    forbiddenMessage: "Você não tem permissão para excluir perfis."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      users: { select: { id: true }, take: 1 },
      permissions: { include: { permission: true } }
    }
  });

  if (!role) {
    return apiError("Perfil não encontrado.", { status: 404 });
  }

  if (role.name === "Administrador") {
    return apiError("O perfil Administrador não pode ser excluído.", { status: 400 });
  }

  if (role.users.length > 0) {
    return apiError("Não é possível excluir perfil vinculado a usuários.", { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Usuarios",
        action: AuditAction.DELETE,
        entity: "Role",
        entityId: id,
        previousValue: {
          name: role.name,
          description: role.description,
          permissions: role.permissions.map(({ permission }) => permission.key)
        }
      }
    });
  });

  return apiSuccess({ deleted: true });
}
