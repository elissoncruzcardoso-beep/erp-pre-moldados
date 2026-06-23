import test from "node:test";
import assert from "node:assert/strict";
import {
  buildS3PostureEvidence,
  collectS3BackupPostureFindings,
  hasSecureTransportDeny,
  validateS3PostureEvidence
} from "../scripts/backup/check-s3-backup-posture.mjs";

const publicAccessBlock = {
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true
  }
};

const kmsEncryption = {
  ServerSideEncryptionConfiguration: {
    Rules: [
      {
        ApplyServerSideEncryptionByDefault: {
          SSEAlgorithm: "aws:kms",
          KMSMasterKeyID: "arn:aws:kms:sa-east-1:123456789012:key/abc"
        },
        BucketKeyEnabled: true
      }
    ]
  }
};

const versioning = {
  Status: "Enabled"
};

const tlsPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "DenyInsecureTransport",
      Effect: "Deny",
      Principal: "*",
      Action: "s3:*",
      Resource: [
        "arn:aws:s3:::precast-backups",
        "arn:aws:s3:::precast-backups/*"
      ],
      Condition: {
        Bool: {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
};

test("S3 backup posture passes with private encrypted versioned bucket", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock,
    encryption: kmsEncryption,
    versioning,
    policy: tlsPolicy,
    lifecycle: { Rules: [{ ID: "daily-retention", Status: "Enabled" }] },
    objectLock: {
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled"
      }
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
});

test("S3 backup posture evidence is safe and valid after a passing audit", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock,
    encryption: kmsEncryption,
    versioning,
    policy: tlsPolicy,
    lifecycle: { Rules: [{ ID: "daily-retention", Status: "Enabled" }] },
    objectLock: {
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled"
      }
    }
  });

  const evidence = buildS3PostureEvidence(
    { ...report, bucket: "precast-backups", region: "sa-east-1" },
    { checkedAt: "2026-06-18T12:00:00.000Z" }
  );

  const errors = validateS3PostureEvidence(evidence, {
    now: new Date("2026-06-18T13:00:00.000Z")
  });

  assert.deepEqual(errors, []);
  assert.equal(evidence.result, "PASS");
});

test("S3 backup posture blocks public access settings disabled", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: false,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    },
    encryption: kmsEncryption,
    versioning,
    policy: tlsPolicy
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /IgnorePublicAcls/);
});

test("S3 backup posture blocks missing versioning", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock,
    encryption: kmsEncryption,
    versioning: {},
    policy: tlsPolicy
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /versionamento/);
});

test("S3 backup posture blocks missing TLS deny policy", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock,
    encryption: kmsEncryption,
    versioning,
    policy: {
      Version: "2012-10-17",
      Statement: []
    }
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /TLS/);
});

test("S3 backup posture evidence rejects expired audits", () => {
  const errors = validateS3PostureEvidence(
    {
      schemaVersion: 1,
      type: "s3-backup-posture",
      checkedAt: "2026-06-01T12:00:00.000Z",
      bucket: "precast-backups",
      region: "sa-east-1",
      publicAccessBlocked: true,
      encryptionAlgorithm: "aws:kms",
      versioningStatus: "Enabled",
      tlsPolicyEnforced: true,
      lifecycleRuleCount: 1,
      objectLockEnabled: true,
      warningCount: 0,
      result: "PASS"
    },
    {
      now: new Date("2026-06-18T12:00:00.000Z"),
      maxAgeHours: 168
    }
  );

  assert.match(errors.join("\n"), /vencida/);
});

test("S3 backup posture evidence rejects secret-looking values", () => {
  const errors = validateS3PostureEvidence({
    schemaVersion: 1,
    type: "s3-backup-posture",
    checkedAt: "2026-06-18T12:00:00.000Z",
    bucket: "precast-backups",
    region: "AWS_SECRET_ACCESS_KEY=exposed",
    publicAccessBlocked: true,
    encryptionAlgorithm: "aws:kms",
    versioningStatus: "Enabled",
    tlsPolicyEnforced: true,
    lifecycleRuleCount: 1,
    objectLockEnabled: true,
    warningCount: 0,
    result: "PASS"
  });

  assert.match(errors.join("\n"), /segredos/);
});

test("TLS deny helper accepts AWS CLI escaped policy string", () => {
  assert.equal(
    hasSecureTransportDeny({ Policy: JSON.stringify(tlsPolicy) }),
    true
  );
});

test("S3 backup posture warns when using AES256 instead of KMS", () => {
  const report = collectS3BackupPostureFindings({
    bucket: "precast-backups",
    publicAccessBlock,
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: "AES256"
            }
          }
        ]
      }
    },
    versioning,
    policy: tlsPolicy
  });

  assert.equal(report.ok, true);
  assert.match(report.warnings.join("\n"), /SSE-S3 AES256/);
});
