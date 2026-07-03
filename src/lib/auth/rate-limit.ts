import { randomUUID } from "node:crypto";

type LoginAttemptRecord = {
  id?: string;
  key: string;
  count: number;
  firstAttemptAt: Date;
  blockedUntil: Date | null;
  updatedAt?: Date;
};

type LoginAttemptDelegate = {
  findUnique(args: { where: { key: string } }): Promise<LoginAttemptRecord | null>;
  deleteMany(args: {
    where: {
      key?: string;
      firstAttemptAt?: { lt: Date };
      updatedAt?: { lt: Date };
    };
  }): Promise<unknown>;
  upsert(args: {
    where: { key: string };
    create: LoginAttemptRecord;
    update: { count: { increment: number } };
  }): Promise<LoginAttemptRecord>;
  update(args: {
    where: { key: string };
    data: { blockedUntil: Date };
  }): Promise<LoginAttemptRecord>;
};

export type LoginRateLimitDatabase = {
  loginAttempt: LoginAttemptDelegate;
};

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function getDatabase(database?: LoginRateLimitDatabase) {
  if (database) {
    return database;
  }

  const { getPrisma } = await import("@/lib/db/prisma");

  return getPrisma() as unknown as LoginRateLimitDatabase;
}

function warnRateLimitFailure(operation: string, error: unknown) {
  console.warn("auth_rate_limit_storage_failure", {
    operation,
    message: error instanceof Error ? error.message : "Erro desconhecido"
  });
}

export function getClientIp(request: Request) {
  // In Vercel the proxy rewrites x-forwarded-for. If this app moves to
  // Nginx/VPS, the proxy must overwrite this header instead of appending it.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp || request.headers.get("x-real-ip") || "local";
}

function getLoginKey(ip: string, email: string) {
  return `${ip}:${email.toLowerCase().trim()}`;
}

function buildAttempt(key: string, now: Date): LoginAttemptRecord {
  return {
    id: randomUUID(),
    key,
    count: 1,
    firstAttemptAt: now,
    blockedUntil: null
  };
}

export async function checkLoginRateLimit(ip: string, email: string, database?: LoginRateLimitDatabase) {
  const db = await getDatabase(database);
  const key = getLoginKey(ip, email);
  const now = new Date();
  const currentTime = now.getTime();

  try {
    const current = await db.loginAttempt.findUnique({ where: { key } });

    if (!current) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const blockedUntil = current.blockedUntil?.getTime() ?? 0;

    if (blockedUntil > currentTime) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((blockedUntil - currentTime) / 1000)
      };
    }

    if (currentTime - current.firstAttemptAt.getTime() > WINDOW_MS) {
      await db.loginAttempt.deleteMany({ where: { key } });
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    // If the durable store is temporarily unavailable and no block can be
    // proven, keep the login flow available and record the operational issue.
    warnRateLimitFailure("check", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function registerFailedLogin(ip: string, email: string, database?: LoginRateLimitDatabase) {
  const db = await getDatabase(database);
  const key = getLoginKey(ip, email);
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const cleanupBefore = new Date(now.getTime() - CLEANUP_AFTER_MS);

  try {
    await db.loginAttempt.deleteMany({ where: { updatedAt: { lt: cleanupBefore } } });
    await db.loginAttempt.deleteMany({ where: { key, firstAttemptAt: { lt: windowStart } } });

    const attempt = await db.loginAttempt.upsert({
      where: { key },
      create: buildAttempt(key, now),
      update: {
        count: { increment: 1 }
      }
    });

    if (attempt.count >= MAX_ATTEMPTS) {
      await db.loginAttempt.update({
        where: { key },
        data: { blockedUntil: new Date(now.getTime() + BLOCK_MS) }
      });
    }
  } catch (error) {
    warnRateLimitFailure("register_failed_login", error);
  }
}

export async function clearFailedLogins(ip: string, email: string, database?: LoginRateLimitDatabase) {
  const db = await getDatabase(database);

  try {
    await db.loginAttempt.deleteMany({ where: { key: getLoginKey(ip, email) } });
  } catch (error) {
    warnRateLimitFailure("clear_failed_login", error);
  }
}
