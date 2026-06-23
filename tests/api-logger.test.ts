import test from "node:test";
import assert from "node:assert/strict";
import { handleApiError } from "../src/lib/api/responses";
import { buildApiLogContext, getRequestId } from "../src/lib/observability/api-logger";

test("api logger reads safe request id from request headers", () => {
  const request = new Request("https://erp.local/api/teste", {
    method: "POST",
    headers: {
      "x-request-id": "req-operacao-123"
    }
  });

  assert.equal(getRequestId(request), "req-operacao-123");
});

test("api logger rejects unsafe request id from request headers", () => {
  const request = new Request("https://erp.local/api/teste", {
    method: "POST",
    headers: {
      "x-request-id": "<script>alert(1)</script>"
    }
  });

  assert.equal(getRequestId(request), "sem-request-id");
});

test("api logger builds trace context without query string", () => {
  const request = new Request("https://erp.local/api/financeiro/contas-receber?token=abc", {
    method: "POST",
    headers: {
      "x-request-id": "req-financeiro-123"
    }
  });

  assert.deepEqual(buildApiLogContext({
    request,
    module: "Financeiro",
    action: "registrar_recebimento",
    userId: "user-1",
    entity: "AccountReceipt"
  }), {
    requestId: "req-financeiro-123",
    module: "Financeiro",
    action: "registrar_recebimento",
    method: "POST",
    path: "/api/financeiro/contas-receber",
    userId: "user-1",
    entity: "AccountReceipt"
  });
});

test("handleApiError structured log keeps request id and masks internal error message", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const originalConsoleError = console.error;
  let logged = "";

  env.NODE_ENV = "production";
  console.error = (message?: unknown) => {
    logged = String(message || "");
  };

  try {
    const request = new Request("https://erp.local/api/estoque/movimentacoes", {
      method: "POST",
      headers: {
        "x-request-id": "req-estoque-123"
      }
    });

    const response = handleApiError(
      new Error("database password leaked in stack trace"),
      "Nao foi possivel registrar a movimentacao.",
      {
        context: {
          request,
          module: "Estoque",
          action: "registrar_movimentacao",
          userId: "user-1",
          entity: "StockMovement"
        },
        event: "stock_movement_error"
      }
    );
    const body = await response.json();
    const parsedLog = JSON.parse(logged);

    assert.equal(body.error, "Nao foi possivel registrar a movimentacao.");
    assert.equal(logged.includes("database password"), false);
    assert.equal(parsedLog.requestId, "req-estoque-123");
    assert.equal(parsedLog.module, "Estoque");
    assert.equal(parsedLog.action, "registrar_movimentacao");
    assert.equal(parsedLog.userId, "user-1");
    assert.equal(parsedLog.event, "stock_movement_error");
    assert.equal(parsedLog.error.name, "Error");
  } finally {
    console.error = originalConsoleError;
    env.NODE_ENV = previousNodeEnv;
  }
});
