const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;

type ApiLogLevel = "info" | "warn" | "error";

type ApiLogBase = {
  request?: Request;
  requestId?: string;
  module: string;
  action: string;
  userId?: string | null;
  entity?: string;
};

type ApiLogEntry = {
  level: ApiLogLevel;
  event: string;
  timestamp: string;
  requestId: string;
  module: string;
  action: string;
  method?: string;
  path?: string;
  userId?: string;
  entity?: string;
  status?: string;
  error?: {
    name: string;
    code?: string;
  };
};

function safeRequestId(value?: string | null) {
  const trimmed = value?.trim();

  if (trimmed && REQUEST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return "sem-request-id";
}

function requestPath(request?: Request) {
  if (!request?.url) return undefined;

  try {
    return new URL(request.url).pathname;
  } catch {
    return undefined;
  }
}

export function getRequestId(request?: Request) {
  return safeRequestId(request?.headers.get(REQUEST_ID_HEADER));
}

export function buildApiLogContext(context: ApiLogBase) {
  const requestId = safeRequestId(context.requestId || context.request?.headers.get(REQUEST_ID_HEADER));

  return {
    requestId,
    module: context.module,
    action: context.action,
    method: context.request?.method,
    path: requestPath(context.request),
    userId: context.userId || undefined,
    entity: context.entity
  };
}

function errorSummary(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

  return {
    name,
    ...(code ? { code } : {})
  };
}

export function logApiEvent(event: string, context: ApiLogBase, status = "ok") {
  const entry: ApiLogEntry = {
    level: "info",
    event,
    timestamp: new Date().toISOString(),
    ...buildApiLogContext(context),
    status
  };

  console.log(JSON.stringify(entry));
}

export function logApiError(error: unknown, event: string, context: ApiLogBase) {
  const entry: ApiLogEntry = {
    level: "error",
    event,
    timestamp: new Date().toISOString(),
    ...buildApiLogContext(context),
    status: "failed",
    error: errorSummary(error)
  };

  console.error(JSON.stringify(entry));
}
