import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readPolicy(name: string) {
  const filePath = path.join(root, "docs", "security", "backups", "aws", name);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function flattenActions(policy: { Statement: Array<{ Action: string | string[] }> }) {
  return policy.Statement.flatMap((statement) =>
    Array.isArray(statement.Action) ? statement.Action : [statement.Action]
  );
}

test("backup IAM policy allows writing backups without delete permission", () => {
  const policy = readPolicy("iam-backup-writer-policy.json");
  const actions = flattenActions(policy);

  assert.ok(actions.includes("s3:PutObject"));
  assert.ok(actions.includes("s3:GetObject"));
  assert.ok(actions.includes("s3:ListBucket"));
  assert.equal(actions.some((action) => /Delete/i.test(action)), false);
});

test("bucket policy blocks insecure transport", () => {
  const policy = readPolicy("bucket-deny-insecure-transport-policy.json");
  const statement = policy.Statement[0];

  assert.equal(statement.Effect, "Deny");
  assert.equal(statement.Condition.Bool["aws:SecureTransport"], "false");
});
