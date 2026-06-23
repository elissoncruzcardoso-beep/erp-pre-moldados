import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLoginRateLimit,
  clearFailedLogins,
  getClientIp,
  registerFailedLogin
} from "../src/lib/auth/rate-limit";

type LoginAttempt = {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
};

function resetLoginRateLimit() {
  (globalThis as unknown as { loginAttempts?: Map<string, LoginAttempt> }).loginAttempts = new Map();
}

test("getClientIp prefers first forwarded IP", () => {
  const request = new Request("https://erp.local/login", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.20"
    }
  });

  assert.equal(getClientIp(request), "203.0.113.10");
});

test("login rate limit blocks after repeated failed attempts and clears after success", () => {
  resetLoginRateLimit();
  const ip = "203.0.113.10";
  const email = "ADMIN@ERP.LOCAL";

  assert.equal(checkLoginRateLimit(ip, email).allowed, true);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    registerFailedLogin(ip, email);
  }

  const blocked = checkLoginRateLimit(ip, "admin@erp.local");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);

  clearFailedLogins(ip, email);
  assert.equal(checkLoginRateLimit(ip, email).allowed, true);
});
