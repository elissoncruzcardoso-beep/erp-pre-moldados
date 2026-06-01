"use client";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const data = payload as ApiErrorPayload;
    return data.error || data.message || fallback;
  }

  return fallback;
}

export async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit, fallbackError: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiRequestError("Falha de conexao. Verifique a internet e tente novamente.", 0, null);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(getErrorMessage(payload, fallbackError), response.status, payload);
  }

  return payload as T;
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}
