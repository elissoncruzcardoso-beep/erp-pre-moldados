import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

test("password hashing uses random salt and verifies only the right password", () => {
  const firstHash = hashPassword("senha-super-segura-123");
  const secondHash = hashPassword("senha-super-segura-123");

  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyPassword("senha-super-segura-123", firstHash), true);
  assert.equal(verifyPassword("senha-errada", firstHash), false);
});

test("password verification rejects malformed stored hashes", () => {
  assert.equal(verifyPassword("senha-super-segura-123", "hash-sem-salt"), false);
});
