import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLoginRateLimit,
  clearFailedLogins,
  getClientIp,
  type LoginRateLimitDatabase,
  registerFailedLogin
} from "../src/lib/auth/rate-limit";

type LoginAttemptRecord = {
  id?: string;
  key: string;
  count: number;
  firstAttemptAt: Date;
  blockedUntil: Date | null;
  updatedAt?: Date;
};

function createFakeRateLimitDatabase(initialRecords: LoginAttemptRecord[] = []): LoginRateLimitDatabase {
  const records = new Map<string, LoginAttemptRecord>();

  for (const record of initialRecords) {
    records.set(record.key, { ...record });
  }

  return {
    loginAttempt: {
      async findUnique({ where }) {
        const record = records.get(where.key);

        return record ? { ...record } : null;
      },
      async deleteMany({ where }) {
        for (const [key, record] of records) {
          const matchesKey = where.key === undefined || where.key === key;
          const matchesFirstAttempt =
            where.firstAttemptAt === undefined || record.firstAttemptAt < where.firstAttemptAt.lt;
          const matchesUpdatedAt =
            where.updatedAt === undefined || (record.updatedAt !== undefined && record.updatedAt < where.updatedAt.lt);

          if (matchesKey && matchesFirstAttempt && matchesUpdatedAt) {
            records.delete(key);
          }
        }

        return {};
      },
      async upsert({ where, create, update }) {
        const current = records.get(where.key);
        const next = current
          ? {
              ...current,
              count: current.count + update.count.increment,
              updatedAt: new Date()
            }
          : {
              ...create,
              updatedAt: new Date()
            };

        records.set(where.key, next);

        return { ...next };
      },
      async update({ where, data }) {
        const current = records.get(where.key);

        if (!current) {
          throw new Error("Registro de tentativa nao encontrado.");
        }

        const next = {
          ...current,
          blockedUntil: data.blockedUntil,
          updatedAt: new Date()
        };

        records.set(where.key, next);

        return { ...next };
      }
    }
  };
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

test("login rate limit blocks after repeated failed attempts and clears after success", async () => {
  const database = createFakeRateLimitDatabase();
  const ip = "203.0.113.10";
  const email = "ADMIN@ERP.LOCAL";

  assert.equal((await checkLoginRateLimit(ip, email, database)).allowed, true);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await registerFailedLogin(ip, email, database);
  }

  const blocked = await checkLoginRateLimit(ip, "admin@erp.local", database);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);

  await clearFailedLogins(ip, email, database);
  assert.equal((await checkLoginRateLimit(ip, email, database)).allowed, true);
});

test("login rate limit uses durable storage instead of global process memory", async () => {
  const now = new Date();
  const key = "203.0.113.10:admin@erp.local";
  const database = createFakeRateLimitDatabase([
    {
      key,
      count: 5,
      firstAttemptAt: now,
      blockedUntil: new Date(now.getTime() + 15 * 60 * 1000)
    }
  ]);

  (globalThis as unknown as { loginAttempts?: Map<string, unknown> }).loginAttempts = new Map();

  const blocked = await checkLoginRateLimit("203.0.113.10", "ADMIN@ERP.LOCAL", database);

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});
