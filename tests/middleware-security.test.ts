import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

function resetApiRateLimit() {
  (globalThis as unknown as { apiRateLimits?: Map<string, RateLimitBucket> }).apiRateLimits = new Map();
}

function makeRequest(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`https://erp.local${path}`, init);
}

test("middleware blocks cross-origin API mutations", async () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://evil.example"
    }
  }));
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "Requisicao bloqueada por protecao CSRF/origem.");
});

test("middleware allows same-origin API mutations", () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://erp.local"
    }
  }));

  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("middleware adds request id to allowed API response", () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://erp.local"
    }
  }));

  assert.match(response.headers.get("x-request-id") || "", /^[A-Za-z0-9._:-]{8,80}$/);
});

test("middleware preserves valid incoming request id", () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://erp.local",
      "x-request-id": "req-operacao-123"
    }
  }));

  assert.equal(response.headers.get("x-request-id"), "req-operacao-123");
});

test("middleware replaces unsafe incoming request id", () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://erp.local",
      "x-request-id": "<script>alert(1)</script>"
    }
  }));

  assert.notEqual(response.headers.get("x-request-id"), "<script>alert(1)</script>");
  assert.match(response.headers.get("x-request-id") || "", /^[A-Za-z0-9._:-]{8,80}$/);
});

test("middleware adds request id to blocked API response", async () => {
  resetApiRateLimit();
  const response = middleware(makeRequest("/api/financeiro/contas-receber", {
    method: "POST",
    headers: {
      origin: "https://evil.example"
    }
  }));

  await response.json();

  assert.match(response.headers.get("x-request-id") || "", /^[A-Za-z0-9._:-]{8,80}$/);
});

test("middleware rate limits repeated API mutations", async () => {
  resetApiRateLimit();
  let response = middleware(makeRequest("/api/teste-rate-limit", {
    method: "POST",
    headers: {
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "203.0.113.44"
    }
  }));

  for (let requestCount = 1; requestCount <= 120; requestCount += 1) {
    response = middleware(makeRequest("/api/teste-rate-limit", {
      method: "POST",
      headers: {
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "203.0.113.44"
      }
    }));
  }

  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.ok, false);
  assert.equal(body.code, "RATE_LIMITED");
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
});
