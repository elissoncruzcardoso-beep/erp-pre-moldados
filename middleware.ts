import { NextResponse, type NextRequest } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/bot/telegram"
]);

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

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!MUTATION_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  if (CSRF_EXEMPT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "Requisicao bloqueada por protecao CSRF/origem." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};

