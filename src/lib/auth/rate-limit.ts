type LoginAttempt = {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const globalRateLimit = globalThis as unknown as {
  loginAttempts?: Map<string, LoginAttempt>;
};

function getLoginAttempts() {
  if (!globalRateLimit.loginAttempts) {
    globalRateLimit.loginAttempts = new Map();
  }

  return globalRateLimit.loginAttempts;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp || request.headers.get("x-real-ip") || "local";
}

function getLoginKey(ip: string, email: string) {
  return `${ip}:${email.toLowerCase().trim()}`;
}

export function checkLoginRateLimit(ip: string, email: string) {
  const attempts = getLoginAttempts();
  const key = getLoginKey(ip, email);
  const now = Date.now();
  const current = attempts.get(key);

  if (!current) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.blockedUntil && current.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.blockedUntil - now) / 1000)
    };
  }

  if (now - current.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function registerFailedLogin(ip: string, email: string) {
  const attempts = getLoginAttempts();
  const key = getLoginKey(ip, email);
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || now - current.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  const count = current.count + 1;
  attempts.set(key, {
    count,
    firstAttemptAt: current.firstAttemptAt,
    blockedUntil: count >= MAX_ATTEMPTS ? now + BLOCK_MS : current.blockedUntil
  });
}

export function clearFailedLogins(ip: string, email: string) {
  getLoginAttempts().delete(getLoginKey(ip, email));
}
