import test from "node:test";
import assert from "node:assert/strict";
import { AuditAction } from "@prisma/client";
import {
  AUDIT_CLEANUP_CONFIRMATION,
  buildAuditRetentionWhere,
  DEFAULT_AUDIT_RETENTION_DAYS,
  normalizeAuditRetentionOptions,
  PRESERVED_AUDIT_ACTIONS
} from "../src/lib/audit/retention";

const now = new Date("2026-06-18T12:00:00.000Z");

test("audit retention defaults to two years and dry confirmation constant is explicit", () => {
  const options = normalizeAuditRetentionOptions({ now });

  assert.equal(options.retentionDays, DEFAULT_AUDIT_RETENTION_DAYS);
  assert.equal(options.batchSize, 1000);
  assert.equal(AUDIT_CLEANUP_CONFIRMATION, "LIMPAR_AUDITORIA");
  assert.deepEqual(options.preserveActions, PRESERVED_AUDIT_ACTIONS);
});

test("audit retention rejects retention windows below operational minimum", () => {
  assert.throws(
    () => normalizeAuditRetentionOptions({ retentionDays: 30, now }),
    /retentionDays precisa ficar entre/
  );
});

test("audit retention rejects oversized batches", () => {
  assert.throws(
    () => normalizeAuditRetentionOptions({ batchSize: 99999, now }),
    /batchSize precisa ficar entre/
  );
});

test("audit retention where filters by cutoff and preserves permission changes", () => {
  const options = normalizeAuditRetentionOptions({ retentionDays: 180, now });
  const where = buildAuditRetentionWhere(options);

  assert.deepEqual(where.createdAt, { lt: options.cutoff });
  assert.deepEqual(where.action, { notIn: [AuditAction.PERMISSION_CHANGE] });
});
