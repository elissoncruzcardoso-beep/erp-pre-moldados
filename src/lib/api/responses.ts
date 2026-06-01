import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

type ApiErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
};

export function apiError(message: string, options: ApiErrorOptions = {}) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code: options.code,
      details: options.details
    },
    { status: options.status || 400 }
  );
}

export function apiSuccess<T extends object>(payload: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...payload }, init);
}

export function apiValidationError(message = "Revise os campos informados.", details?: unknown) {
  return apiError(message, { status: 400, code: "VALIDATION_ERROR", details });
}

export function apiUnauthorized(message = "Sessao expirada. Entre novamente.") {
  return apiError(message, { status: 401, code: "UNAUTHORIZED" });
}

export function apiForbidden(message = "Voce nao tem permissao para executar esta acao.") {
  return apiError(message, { status: 403, code: "FORBIDDEN" });
}

export function apiConflict(message: string) {
  return apiError(message, { status: 409, code: "CONFLICT" });
}

export function handleApiError(error: unknown, fallback = "Nao foi possivel concluir a operacao.") {
  if (error instanceof ZodError) {
    return apiValidationError(fallback, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return apiConflict("Ja existe um registro com estes dados.");
    }
  }

  const message = error instanceof Error ? error.message : fallback;
  return apiError(message || fallback, { status: 400 });
}
