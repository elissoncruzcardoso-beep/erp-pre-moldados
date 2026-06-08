import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { apiForbidden, apiUnauthorized } from "@/lib/api/responses";
import { getSession, type SessionUser } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/permissions/permissions";

type PageSessionOptions = {
  nextPath: string;
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  anyPermission?: PermissionKey[];
  anyRole?: string[];
  forbiddenPath?: string;
};

type ApiSessionOptions = {
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  anyPermission?: PermissionKey[];
  anyRole?: string[];
  forbiddenMessage?: string;
};

type ApiSessionResult =
  | { session: SessionUser; response?: never }
  | { session?: never; response: NextResponse };

const AUDIT_ROLES = ["Administrador", "Diretoria"];

export function hasPermission(session: SessionUser, permission: PermissionKey) {
  return session.permissions.includes(permission);
}

export function hasAllPermissions(session: SessionUser, permissions: PermissionKey[]) {
  return permissions.every((permission) => hasPermission(session, permission));
}

export function hasAnyPermission(session: SessionUser, permissions: PermissionKey[]) {
  return permissions.some((permission) => hasPermission(session, permission));
}

export function hasRole(session: SessionUser, roles: string[]) {
  return roles.includes(session.role);
}

export function canViewOperationAudit(session: SessionUser) {
  return hasRole(session, AUDIT_ROLES) && hasPermission(session, "auditoria.view");
}

function canAccess(
  session: SessionUser,
  options: Pick<PageSessionOptions, "permission" | "permissions" | "anyPermission" | "anyRole">
) {
  if (options.anyRole && hasRole(session, options.anyRole)) return true;
  if (options.permission && !hasPermission(session, options.permission)) return false;
  if (options.permissions && !hasAllPermissions(session, options.permissions)) return false;
  if (options.anyPermission && !hasAnyPermission(session, options.anyPermission)) return false;

  return true;
}

export async function requirePageSession({
  nextPath,
  forbiddenPath = "/dashboard",
  ...options
}: PageSessionOptions) {
  const session = await getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!canAccess(session, options)) {
    redirect(forbiddenPath);
  }

  return session;
}

export async function requireApiSession({
  forbiddenMessage = "Voce nao tem permissao para executar esta acao.",
  ...options
}: ApiSessionOptions = {}): Promise<ApiSessionResult> {
  const session = await getSession();

  if (!session) {
    return {
      response: apiUnauthorized()
    };
  }

  if (!canAccess(session, options)) {
    return {
      response: apiForbidden(forbiddenMessage)
    };
  }

  return { session };
}
