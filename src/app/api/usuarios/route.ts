import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { hashPassword } from "@/lib/auth/password";
import { canGrantAdminProfile, isAdminRoleName, requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { userSchema } from "@/lib/validations/user";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "usuarios.manage",
    forbiddenMessage: "Voce nao tem permissao para criar usuarios."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = userSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise nome, e-mail, senha, perfil e status.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });

  if (!role) {
    return apiError("Perfil informado nao existe.", { status: 400 });
  }

  if (isAdminRoleName(role.name) && !canGrantAdminProfile(auth.session)) {
    return apiError("Voce nao tem permissao para conceder o perfil Administrador.", { status: 403 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        department: parsed.data.department || null,
        roleId: parsed.data.roleId,
        status: parsed.data.status,
        passwordHash: hashPassword(parsed.data.password)
      },
      include: { role: true }
    });

    await prisma.auditLog
      .create({
        data: {
          userId: auth.session.userId,
          module: "Usuarios",
          action: AuditAction.CREATE,
          entity: "User",
          entityId: user.id,
          newValue: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
            status: user.status,
            department: user.department
          }
        }
      })
      .catch(() => null);

    return apiSuccess({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe usuario com este e-mail.");
    }

    return handleApiError(error, "Nao foi possivel criar o usuario.", {
      context: {
        request,
        module: "Usuarios",
        action: "criar_usuario",
        userId: auth.session.userId,
        entity: "User"
      },
      event: "user_create_error"
    });
  }
}
