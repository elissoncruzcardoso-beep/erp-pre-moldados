import test from "node:test";
import assert from "node:assert/strict";
import { handleApiError } from "../src/lib/api/responses";

test("handleApiError returns fallback without leaking internal message", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "production";

  try {
    const response = handleApiError(
      new Error("database password leaked in stack trace"),
      "Nao foi possivel concluir a operacao."
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "Nao foi possivel concluir a operacao.");
    assert.equal(JSON.stringify(body).includes("database password"), false);
  } finally {
    env.NODE_ENV = previousNodeEnv;
  }
});

test("handleApiError respects explicit status", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "production";

  try {
    const response = handleApiError(
      new Error("database unavailable"),
      "Nao foi possivel concluir a operacao.",
      { status: 500 }
    );
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, "Nao foi possivel concluir a operacao.");
  } finally {
    env.NODE_ENV = previousNodeEnv;
  }
});
