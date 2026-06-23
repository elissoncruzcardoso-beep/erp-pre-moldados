import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";

test("global security headers include CSP, frame protection, nosniff, HSTS and privacy policies", async () => {
  const headerRules = await nextConfig.headers?.();
  assert.ok(headerRules);

  const globalHeaders = new Map(headerRules[0]?.headers.map((header) => [header.key, header.value]));
  const csp = globalHeaders.get("Content-Security-Policy") || "";

  assert.equal(globalHeaders.get("X-Frame-Options"), "DENY");
  assert.equal(globalHeaders.get("X-Content-Type-Options"), "nosniff");
  assert.equal(globalHeaders.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains; preload");
  assert.equal(globalHeaders.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(globalHeaders.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("production CSP does not allow unsafe script execution", async () => {
  assert.notEqual(process.env.NODE_ENV, "development");

  const headerRules = await nextConfig.headers?.();
  assert.ok(headerRules);

  const globalHeaders = new Map(headerRules[0]?.headers.map((header) => [header.key, header.value]));
  const csp = globalHeaders.get("Content-Security-Policy") || "";

  assert.equal(csp.includes("'unsafe-eval'"), false);
  assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false);
});
