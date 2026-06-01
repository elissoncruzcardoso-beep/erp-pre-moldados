import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { apiUnauthorized, apiValidationError } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/permissions/permissions";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Informe e-mail e senha validos.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    return apiUnauthorized("Acesso nao autorizado.");
  }

  const validPassword = verifyPassword(parsed.data.password, user.passwordHash);

  if (!validPassword) {
    return apiUnauthorized("Acesso nao autorizado.");
  }

  const permissions = user.role.permissions.map((item) => item.permission.key as PermissionKey);
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions
  });

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        module: "Autenticacao",
        action: AuditAction.LOGIN,
        entity: "User",
        entityId: user.id
      }
    })
    .catch(() => null);

  const response = NextResponse.json({
    ok: true,
    user: {
      name: user.name,
      email: user.email,
      role: user.role.name,
      permissions
    }
  });

  setSessionCookie(response, token);

  return response;
}
