import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { apiError, apiUnauthorized, apiValidationError, handleApiError } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  clearFailedLogins,
  getClientIp,
  registerFailedLogin
} from "@/lib/auth/rate-limit";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { logApiEvent } from "@/lib/observability/api-logger";
import type { PermissionKey } from "@/lib/permissions/permissions";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const logContext = {
    request,
    module: "Autenticacao",
    action: "login"
  };
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Informe e-mail e senha validos.", parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase().trim();
  const clientIp = getClientIp(request);
  const rateLimit = checkLoginRateLimit(clientIp, email);

  if (!rateLimit.allowed) {
    logApiEvent("auth_login_rate_limited", logContext, "blocked");
    return apiError("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.", {
      status: 429,
      code: "RATE_LIMITED",
      details: { retryAfterSeconds: rateLimit.retryAfterSeconds }
    });
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email },
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
      registerFailedLogin(clientIp, email);
      logApiEvent("auth_login_failed", logContext, "blocked");
      return apiUnauthorized("Acesso nao autorizado.");
    }

    const validPassword = verifyPassword(parsed.data.password, user.passwordHash);

    if (!validPassword) {
      registerFailedLogin(clientIp, email);
      logApiEvent("auth_login_failed", logContext, "blocked");
      return apiUnauthorized("Acesso nao autorizado.");
    }

    clearFailedLogins(clientIp, email);

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

    logApiEvent("auth_login_success", { ...logContext, userId: user.id, entity: "User" });

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
  } catch (error) {
    return handleApiError(error, "Nao foi possivel entrar no ERP.", {
      context: logContext,
      event: "auth_login_error"
    });
  }
}
