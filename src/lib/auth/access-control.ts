import { rolePermissionMap, type PermissionKey, type RoleName } from "@/lib/permissions/permissions";

export function roleHasPermission(role: RoleName, permission: PermissionKey) {
  const rolePermissions: readonly PermissionKey[] = rolePermissionMap[role];
  return rolePermissions.includes(permission);
}

export function assertPermission(role: RoleName, permission: PermissionKey) {
  if (!roleHasPermission(role, permission)) {
    throw new Error(`Perfil ${role} não possui permissão ${permission}.`);
  }
}

export function listRolePermissions(role: RoleName) {
  return [...rolePermissionMap[role]];
}
