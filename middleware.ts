import { NextResponse, type NextRequest } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const API_RATE_LIMIT_MAX_READS = 300;
const API_RATE_LIMIT_MAX_MUTATIONS = 120;
const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;
const CSRF_EXEMPT_PATHS = new Set([
  "/api/bot/telegram"
]);

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as unknown as {
  apiRateLimits?: Map<string, RateLimitBucket>;
};

function getRateLimitStore() {
  if (!globalRateLimit.apiRateLimits) {
    globalRateLimit.apiRateLimits = new Map();
  }

  return globalRateLimit.apiRateLimits;
}

function normalizeOrigin(value?: string) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getTrustedOrigins(request: NextRequest) {
  const currentOrigin = request.nextUrl.origin;
  const configuredOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
  ]
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return new Set([currentOrigin, ...configuredOrigins]);
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp || request.headers.get("x-real-ip") || "local";
}

function getRequestId(request: NextRequest) {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim();

  if (incoming && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }

  return crypto.randomUUID();
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function nextWithRequestId(request: NextRequest, requestId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  return withRequestId(
    NextResponse.next({
      request: {
        headers: requestHeaders
      }
    }),
    requestId
  );
}

function checkApiRateLimit(request: NextRequest) {
  const store = getRateLimitStore();
  const now = Date.now();
  const isMutation = MUTATION_METHODS.has(request.method);
  const limit = isMutation ? API_RATE_LIMIT_MAX_MUTATIONS : API_RATE_LIMIT_MAX_READS;
  const key = `${getClientIp(request)}:${request.method}:${request.nextUrl.pathname}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + API_RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: "Muitas requisicoes. Aguarde alguns segundos e tente novamente.",
        code: "RATE_LIMITED"
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds)
        }
      }
    );
  }

  current.count += 1;
  return null;
}

function isSameOriginMutation(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin || undefined);

  if (normalizedRequestOrigin) {
    return getTrustedOrigins(request).has(normalizedRequestOrigin);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin" || fetchSite === "same-site";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = getRequestId(request);

  if (!pathname.startsWith("/api/")) {
    return nextWithRequestId(request, requestId);
  }

  const rateLimitResponse = checkApiRateLimit(request);
  if (rateLimitResponse) {
    return withRequestId(rateLimitResponse, requestId);
  }

  if (!MUTATION_METHODS.has(request.method)) {
    return nextWithRequestId(request, requestId);
  }

  if (CSRF_EXEMPT_PATHS.has(pathname)) {
    return nextWithRequestId(request, requestId);
  }

  if (!isSameOriginMutation(request)) {
    return withRequestId(
      NextResponse.json(
        { error: "Requisicao bloqueada por protecao CSRF/origem." },
        { status: 403 }
      ),
      requestId
    );
  }

  return nextWithRequestId(request, requestId);
}

export const config = {
  matcher: "/api/:path*"
};
