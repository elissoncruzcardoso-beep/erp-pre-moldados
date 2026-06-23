import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSessionToken, verifySessionToken } from "../src/lib/auth/session";

process.env.AUTH_SECRET = "test-auth-secret-with-at-least-44-safe-chars-1234567890";

const baseSession = {
  userId: "user-1",
  email: "admin@erp.local",
  name: "Administrador ERP",
  role: "Administrador",
  permissions: ["dashboard.view" as const]
};

test("session token validates signed payload", () => {
  const token = createSessionToken(baseSession);
  const session = verifySessionToken(token);

  assert.equal(session?.userId, baseSession.userId);
  assert.equal(session?.role, baseSession.role);
  assert.deepEqual(session?.permissions, baseSession.permissions);
});

test("session token rejects tampered payload", () => {
  const token = createSessionToken(baseSession);
  const [, signature] = token.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...baseSession, role: "Diretoria", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "utf8"
  ).toString("base64url");

  assert.equal(verifySessionToken(`${tamperedPayload}.${signature}`), null);
});

test("session token rejects malformed payload without throwing", () => {
  assert.equal(verifySessionToken("not-json.valid-signature"), null);
});

test("session token rejects expired signed payload", () => {
  const payload = {
    ...baseSession,
    exp: Math.floor(Date.now() / 1000) - 10
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", process.env.AUTH_SECRET || "").update(encodedPayload).digest("base64url");

  assert.equal(verifySessionToken(`${encodedPayload}.${signature}`), null);
});

test("session token creation rejects weak auth secret", () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "curta";

  try {
    assert.throws(
      () => createSessionToken(baseSession),
      /AUTH_SECRET precisa ser configurado/
    );
  } finally {
    process.env.AUTH_SECRET = previousSecret;
  }
});
