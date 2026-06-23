import test from "node:test";
import assert from "node:assert/strict";
import { collectEnvSecurityErrors, collectEnvSecurityWarnings } from "../scripts/check-env-security.mjs";

test("environment security check rejects placeholders and weak secrets", () => {
  const errors = collectEnvSecurityErrors({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://usuario:senha@host:5432/erp",
    AUTH_SECRET: "curta",
    CRON_SECRET: "ci-cron-secret",
    TELEGRAM_WEBHOOK_SECRET: "ci-webhook-secret",
    TELEGRAM_BOT_TOKEN: "ci-token"
  });

  assert.match(errors.join("\n"), /DATABASE_URL/);
  assert.match(errors.join("\n"), /AUTH_SECRET/);
  assert.match(errors.join("\n"), /CRON_SECRET/);
  assert.match(errors.join("\n"), /TELEGRAM_WEBHOOK_SECRET/);
});

test("environment security check accepts strong local values", () => {
  const errors = collectEnvSecurityErrors({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://app:strong-password@db.example.com:5432/erp",
    AUTH_SECRET: "local_AUTH_SECRET_1234567890123456789012345678901234567890",
    CRON_SECRET: "local_CRON_SECRET_123456789012345678901234567890",
    TELEGRAM_WEBHOOK_SECRET: "local_TELEGRAM_WEBHOOK_SECRET_123456789012345678901234567890",
    TELEGRAM_BOT_TOKEN: "ci-token"
  });

  assert.deepEqual(errors, []);
});

test("environment security check rejects direct Supabase URL on Vercel", () => {
  const errors = collectEnvSecurityErrors({
    NODE_ENV: "production",
    VERCEL: "1",
    DATABASE_URL: "postgresql://postgres:secret@db.kduhavdaagloopbikbaj.supabase.co:5432/postgres",
    AUTH_SECRET: "prod_AUTH_SECRET_1234567890123456789012345678901234567890",
    CRON_SECRET: "prod_CRON_SECRET_123456789012345678901234567890"
  });

  assert.match(errors.join("\n"), /pooler/);
});

test("environment security check warns about direct Supabase URL outside Vercel", () => {
  const warnings = collectEnvSecurityWarnings({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:secret@db.kduhavdaagloopbikbaj.supabase.co:5432/postgres"
  });

  assert.match(warnings.join("\n"), /Vercel/);
});

test("environment security check accepts Supabase pooler URL on Vercel", () => {
  const errors = collectEnvSecurityErrors({
    NODE_ENV: "production",
    VERCEL: "1",
    DATABASE_URL: "postgresql://postgres:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    AUTH_SECRET: "prod_AUTH_SECRET_1234567890123456789012345678901234567890",
    CRON_SECRET: "prod_CRON_SECRET_123456789012345678901234567890"
  });

  assert.deepEqual(errors, []);
});
