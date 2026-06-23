import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkBackupConfig } from "./check-backup-config.mjs";
import { checkBackupEvidenceFile } from "./check-backup-evidence.mjs";
import { checkRestoreDrillEvidenceFile } from "./check-restore-drill-evidence.mjs";
import { checkS3PostureEvidenceFile } from "./check-s3-backup-posture.mjs";
import { resolveBackupEnvFile } from "./backup-env.mjs";

const root = process.cwd();
const defaultBackupEvidencePath = path.join(root, "docs", "security", "backups", "latest.json");
const defaultS3EvidencePath = path.join(root, "docs", "security", "backups", "s3-posture-latest.json");
const defaultEvidencePath = path.join(root, "docs", "security", "restore-drills", "latest.json");

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasSecretLikeValue(value) {
  if (typeof value !== "string") return false;
  if (/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(value)) return true;
  if (/(AUTH_SECRET|TOKEN|PASSWORD|SENHA|SECRET|KEY)\s*=/i.test(value)) return true;
  return false;
}

export function collectSecretLeaks(value, pathParts = []) {
  const leaks = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      leaks.push(...collectSecretLeaks(item, [...pathParts, String(index)]));
    }
    return leaks;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      leaks.push(...collectSecretLeaks(nested, [...pathParts, key]));
    }
    return leaks;
  }

  if (hasSecretLikeValue(value)) {
    leaks.push(pathParts.join(".") || "root");
  }

  return leaks;
}

function summarizeBackupConfig(report) {
  if (!report) {
    return {
      ok: false,
      checks: [],
      warnings: [],
      errors: ["backup: configuracao nao retornou relatorio valido"]
    };
  }

  const ok = report.ok === true;
  const errors = Array.isArray(report.errors) ? report.errors : [];
  if (!ok && errors.length === 0) {
    errors.push("backup: checagem nao concluiu ou nao retornou erros detalhados");
  }

  return {
    ok,
    envFile: report.envFile,
    backupDatabase: report.backupDatabase,
    restoreDatabase: report.restoreDatabase,
    checks: Array.isArray(report.checks) ? report.checks : [],
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    errors
  };
}

function summarizeBackupEvidence(report) {
  if (!report) {
    return {
      ok: false,
      evidencePath: "desconhecido",
      summary: null,
      errors: ["backup: evidencia nao retornou relatorio valido"]
    };
  }

  const evidence = report.evidence || null;

  const ok = report.ok === true;
  const errors = Array.isArray(report.errors) ? report.errors : [];
  if (!ok && errors.length === 0) {
    errors.push("backup: evidencia nao concluiu ou nao retornou erros detalhados");
  }

  return {
    ok,
    evidencePath: report.evidencePath,
    summary: evidence
      ? {
          performedAt: evidence.performedAt,
          operator: evidence.operator,
          destination: evidence.destination,
          checksumUri: evidence.checksumUri,
          sizeBytes: evidence.sizeBytes,
          encryption: evidence.encryption,
          result: evidence.result
        }
      : null,
    errors
  };
}

function summarizeS3PostureEvidence(report) {
  if (report === undefined) {
    return {
      ok: true,
      skipped: true,
      evidencePath: "nao informado",
      summary: null,
      errors: []
    };
  }

  if (!report) {
    return {
      ok: false,
      skipped: false,
      evidencePath: "desconhecido",
      summary: null,
      errors: ["s3: evidencia de postura nao retornou relatorio valido"]
    };
  }

  const evidence = report.evidence || null;
  const ok = report.ok === true;
  const errors = Array.isArray(report.errors) ? report.errors : [];
  if (!ok && errors.length === 0) {
    errors.push("s3: evidencia de postura nao concluiu ou nao retornou erros detalhados");
  }

  return {
    ok,
    skipped: false,
    evidencePath: report.evidencePath,
    summary: evidence
      ? {
          checkedAt: evidence.checkedAt,
          bucket: evidence.bucket,
          region: evidence.region,
          encryptionAlgorithm: evidence.encryptionAlgorithm,
          versioningStatus: evidence.versioningStatus,
          publicAccessBlocked: evidence.publicAccessBlocked,
          tlsPolicyEnforced: evidence.tlsPolicyEnforced,
          lifecycleRuleCount: evidence.lifecycleRuleCount,
          objectLockEnabled: evidence.objectLockEnabled,
          result: evidence.result
        }
      : null,
    errors
  };
}

function summarizeRestoreEvidence(report) {
  if (!report) {
    return {
      ok: false,
      evidencePath: "desconhecido",
      summary: null,
      errors: ["restore: evidencia nao retornou relatorio valido"]
    };
  }

  const evidence = report.evidence || null;

  const ok = report.ok === true;
  const errors = Array.isArray(report.errors) ? report.errors : [];
  if (!ok && errors.length === 0) {
    errors.push("restore: checagem nao concluiu ou nao retornou erros detalhados");
  }

  return {
    ok,
    evidencePath: report.evidencePath,
    summary: evidence
      ? {
          performedAt: evidence.performedAt,
          operator: evidence.operator,
          sourceBackup: evidence.sourceBackup,
          restoreTarget: evidence.restoreTarget,
          publicTableCount: evidence.publicTableCount,
          result: evidence.result
        }
      : null,
    errors
  };
}

export function buildReadinessReport({
  backupConfig,
  backupEvidence,
  s3PostureEvidence,
  restoreEvidence,
  generatedAt = new Date().toISOString()
}) {
  const backup = summarizeBackupConfig(backupConfig);
  const backupRun = summarizeBackupEvidence(backupEvidence);
  const s3Posture = summarizeS3PostureEvidence(s3PostureEvidence);
  const restore = summarizeRestoreEvidence(restoreEvidence);
  const blockers = [];
  const warnings = [];
  const nextActions = [];

  if (!backup.ok) {
    blockers.push(...backup.errors);
    nextActions.push("Configurar variaveis de backup externo em arquivo seguro fora do repositorio.");
    nextActions.push("Rodar npm run backup:check-config com as ferramentas AWS CLI e PostgreSQL instaladas.");
  }

  if (backup.ok && !backupRun.ok) {
    warnings.push(...backupRun.errors);
    nextActions.push("Executar um backup completo real para gerar docs/security/backups/latest.json.");
  }

  if (backup.ok && !s3Posture.skipped && !s3Posture.ok) {
    warnings.push(...s3Posture.errors);
    nextActions.push("Rodar npm run backup:check-s3 com --write-evidence para comprovar a postura segura do bucket.");
  }

  if (backup.ok && backupRun.ok && !restore.ok) {
    warnings.push(...restore.errors);
    nextActions.push("Executar um restore drill em banco temporario e gravar docs/security/restore-drills/latest.json.");
  }

  if (backup.ok && backupRun.ok && (s3Posture.skipped || s3Posture.ok) && restore.ok) {
    nextActions.push("Manter rotina mensal de restore drill e revisar evidencias antes do vencimento.");
  }

  if (backup.warnings.length > 0) {
    warnings.push(...backup.warnings);
  }

  const status = blockers.length > 0 ? "BLOQUEADO" : warnings.length > 0 ? "PARCIAL" : "PRONTO";
  const report = {
    schemaVersion: 1,
    generatedAt,
    status,
    ready: status === "PRONTO",
    backup,
    backupRun,
    s3Posture,
    restore,
    blockers,
    warnings,
    nextActions
  };

  const leaks = collectSecretLeaks(report);
  if (leaks.length > 0) {
    return {
      ...report,
      status: "BLOQUEADO",
      ready: false,
      blockers: [
        ...report.blockers,
        `relatorio contem valor sensivel em: ${leaks.join(", ")}`
      ]
    };
  }

  return report;
}

function main() {
  const args = process.argv.slice(2);
  const envFile = resolveBackupEnvFile(getArg(args, "--env-file"));
  const backupEvidencePath = path.resolve(root, getArg(args, "--backup-evidence", defaultBackupEvidencePath));
  const s3EvidencePath = path.resolve(root, getArg(args, "--s3-evidence", defaultS3EvidencePath));
  const evidencePath = path.resolve(root, getArg(args, "--evidence", defaultEvidencePath));
  const maxBackupAgeHours = getArg(args, "--max-backup-age-hours", "36");
  const maxS3AgeHours = getArg(args, "--max-s3-age-hours", "168");
  const maxAgeDays = getArg(args, "--max-age-days", "45");
  const checkTools = args.includes("--check-tools");
  const strict = args.includes("--strict");
  const jsonOutput = args.includes("--json");

  const report = buildReadinessReport({
    backupConfig: checkBackupConfig({ envFile, skipTools: !checkTools }),
    backupEvidence: checkBackupEvidenceFile({ evidencePath: backupEvidencePath, maxAgeHours: Number(maxBackupAgeHours) }),
    s3PostureEvidence: checkS3PostureEvidenceFile({ evidencePath: s3EvidencePath, maxAgeHours: Number(maxS3AgeHours) }),
    restoreEvidence: checkRestoreDrillEvidenceFile({ evidencePath, maxAgeDays: Number(maxAgeDays) })
  });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Relatorio de prontidao backup/DR");
    console.log(`Status: ${report.status}`);
    console.log(`Gerado em: ${report.generatedAt}`);
    console.log(`Backup externo: ${report.backup.ok ? "OK" : "pendente"}`);
    console.log(`Ultimo backup completo: ${report.backupRun.ok ? "OK" : "pendente"}`);
    console.log(`Postura S3: ${report.s3Posture.ok ? "OK" : "pendente"}`);
    console.log(`Restore drill: ${report.restore.ok ? "OK" : "pendente"}`);

    for (const blocker of report.blockers) {
      console.log(`BLOQUEIO - ${blocker}`);
    }

    for (const warning of report.warnings) {
      console.log(`AVISO - ${warning}`);
    }

    for (const action of report.nextActions) {
      console.log(`PROXIMO - ${action}`);
    }
  }

  if (strict && report.status !== "PRONTO") {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
