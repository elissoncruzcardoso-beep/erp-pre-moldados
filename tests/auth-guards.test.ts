import test from "node:test";
import assert from "node:assert/strict";
import { canGrantAdminProfile, canRunMaintenanceCleanup, canViewOperationAudit, isAdminRoleName } from "../src/lib/auth/guards";
import type { SessionUser } from "../src/lib/auth/session";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "user-1",
    email: "user@erp.local",
    name: "Usuario ERP",
    role: "Suprimentos",
    permissions: ["dashboard.view"],
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides
  };
}

test("canGrantAdminProfile only allows administrator role or explicit grant permission", () => {
  assert.equal(canGrantAdminProfile(session()), false);
  assert.equal(canGrantAdminProfile(session({ role: "Administrador" })), true);
  assert.equal(canGrantAdminProfile(session({ permissions: ["usuarios.grant_admin"] })), true);
});

test("canViewOperationAudit requires audit role and audit permission", () => {
  assert.equal(canViewOperationAudit(session({ role: "Diretoria" })), false);
  assert.equal(canViewOperationAudit(session({ role: "Diretoria", permissions: ["auditoria.view"] })), true);
});

test("canRunMaintenanceCleanup requires administrator role and cleanup permission", () => {
  assert.equal(canRunMaintenanceCleanup(session({ role: "Administrador" })), false);
  assert.equal(canRunMaintenanceCleanup(session({ permissions: ["manutencao.cleanup"] })), false);
  assert.equal(canRunMaintenanceCleanup(session({ role: "Administrador", permissions: ["manutencao.cleanup"] })), true);
});

test("isAdminRoleName matches only the protected administrator role", () => {
  assert.equal(isAdminRoleName("Administrador"), true);
  assert.equal(isAdminRoleName("Diretoria"), false);
});
