import { timingSafeEqual } from "node:crypto";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "A senha precisa ter pelo menos 12 caracteres.")
});

function hasValidSetupSecret(request: Request) {
  const configuredSecret = process.env.ADMIN_SETUP_SECRET;
  const receivedSecret = request.headers.get("x-admin-setup-secret");

  if (process.env.ADMIN_SETUP_ENABLED !== "true" || !configuredSecret || !receivedSecret) {
    return false;
  }

  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(receivedSecret);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || !hasValidSetupSecret(request)) {
    return apiError("Setup do administrador desativado em producao.", { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Informe um e-mail valido e uma senha com pelo menos 12 caracteres.", parsed.error.flatten());
  }

  const prisma = getPrisma();

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: {
          select: {
            name: true
          }
        }
      }
    });

    if (!user || user.role.name !== "Administrador") {
      return apiError("Administrador inicial nao encontrado.", { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(parsed.data.password),
          status: "ACTIVE"
        }
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          module: "Setup",
          action: AuditAction.UPDATE,
          entity: "User",
          entityId: user.id,
          newValue: {
            email: user.email,
            reset: Boolean(user.passwordHash),
            status: "ACTIVE"
          }
        }
      });
    });

    return apiSuccess({
      reset: Boolean(user.passwordHash),
      user: {
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel configurar a senha do administrador.", {
      context: {
        request,
        module: "Setup",
        action: "configurar_senha_admin",
        entity: "User"
      },
      event: "admin_password_setup_error"
    });
  }
}
