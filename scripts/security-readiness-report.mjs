import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const nodeCommand = process.execPath;

const defaultChecks = [
  {
    key: "env",
    label: "Ambiente e segredos",
    command: ["scripts/check-env-security.mjs"],
    critical: true
  },
  {
    key: "rawSql",
    label: "SQL raw bloqueado",
    command: ["scripts/check-no-raw-sql.mjs"],
    critical: true
  },
  {
    key: "queryLimits",
    label: "Limites em consultas",
    command: ["scripts/check-findmany-limits.mjs"],
    critical: false
  },
  {
    key: "publicExposure",
    label: "Exposicao publica",
    command: ["scripts/check-public-exposure.mjs"],
    critical: true
  },
  {
    key: "supabaseRls",
    label: "Supabase RLS",
    command: ["scripts/check-supabase-rls-hardening.mjs"],
    critical: true
  },
  {
    key: "apiErrors",
    label: "Erros de API",
    command: ["scripts/check-api-error-leaks.mjs"],
    critical: true
  },
  {
    key: "apiAuth",
    label: "Autenticacao em APIs",
    command: ["scripts/check-api-auth-guards.mjs"],
    critical: true
  },
  {
    key: "apiAudit",
    label: "Auditoria em APIs",
    command: ["scripts/check-api-audit-coverage.mjs"],
    critical: true
  },
  {
    key: "apiObservability",
    label: "Observabilidade em APIs",
    command: ["scripts/check-api-observability.mjs"],
    critical: true
  },
  {
    key: "healthRoute",
    label: "Healthcheck seguro",
    command: ["scripts/check-health-route.mjs"],
    critical: false
  },
  {
    key: "migrations",
    label: "Migrations Prisma",
    command: ["scripts/check-prisma-migrations.mjs"],
    critical: true
  },
  {
    key: "backupDr",
    label: "Backup e Disaster Recovery",
    command: ["scripts/backup/backup-readiness-report.mjs", "--json"],
    critical: true,
    parseBackupReadiness: true
  }
];

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

function shortErrorFor(command, output) {
  const text = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !hasSecretLikeValue(line))
    .slice(0, 5)
    .join(" | ");

  return text || `comando falhou: node ${command.join(" ")}`;
}

function parseBackupReadiness(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function resultFromBackupReadiness(definition, result) {
  const report = parseBackupReadiness(result.stdout || "");
  if (!report) {
    return {
      key: definition.key,
      label: definition.label,
      critical: definition.critical,
      ok: false,
      status: "BLOQUEADO",
      warnings: [],
      errors: ["backup: relatorio JSON invalido ou ausente"]
    };
  }

  const status = report.status || "BLOQUEADO";
  return {
    key: definition.key,
    label: definition.label,
    critical: definition.critical,
    ok: status === "PRONTO",
    status,
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    errors: Array.isArray(report.blockers) ? report.blockers : [],
    nextActions: Array.isArray(report.nextActions) ? report.nextActions : []
  };
}

function runCheck(definition, { cwd = process.cwd() } = {}) {
  const result = spawnSync(nodeCommand, definition.command, {
    cwd,
    encoding: "utf8",
    shell: false
  });

  if (definition.parseBackupReadiness && result.status === 0) {
    return resultFromBackupReadiness(definition, result);
  }

  if (result.status === 0) {
    return {
      key: definition.key,
      label: definition.label,
      critical: definition.critical,
      ok: true,
      status: "OK",
      warnings: [],
      errors: []
    };
  }

  return {
    key: definition.key,
    label: definition.label,
    critical: definition.critical,
    ok: false,
    status: definition.critical ? "BLOQUEADO" : "PARCIAL",
    warnings: [],
    errors: [
      result.error?.message || shortErrorFor(definition.command, `${result.stderr || ""}\n${result.stdout || ""}`)
    ]
  };
}

export function buildSecurityReadinessReport({
  checks,
  generatedAt = new Date().toISOString()
}) {
  const blockers = [];
  const warnings = [];
  const nextActions = [];

  for (const check of checks) {
    if (!check.ok && check.critical) {
      blockers.push(...(check.errors?.length ? check.errors : [`${check.label}: falhou`]));
    } else if (!check.ok) {
      warnings.push(...(check.errors?.length ? check.errors : [`${check.label}: pendente`]));
    }

    if (check.warnings?.length) {
      warnings.push(...check.warnings);
    }

    if (check.nextActions?.length) {
      nextActions.push(...check.nextActions);
    }
  }

  const status = blockers.length > 0 ? "BLOQUEADO" : warnings.length > 0 ? "PARCIAL" : "PRONTO";
  const report = {
    schemaVersion: 1,
    generatedAt,
    status,
    ready: status === "PRONTO",
    checks,
    blockers,
    warnings,
    nextActions: [...new Set(nextActions)]
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

export function collectSecurityReadinessChecks({ cwd = process.cwd() } = {}) {
  return defaultChecks.map((definition) => runCheck(definition, { cwd }));
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const jsonOutput = args.includes("--json");
  const report = buildSecurityReadinessReport({
    checks: collectSecurityReadinessChecks()
  });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Relatorio consolidado de seguranca e producao");
    console.log(`Status: ${report.status}`);
    console.log(`Gerado em: ${report.generatedAt}`);

    for (const check of report.checks) {
      console.log(`${check.ok ? "OK" : check.critical ? "BLOQUEIO" : "AVISO"} - ${check.label}: ${check.status}`);
    }

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
