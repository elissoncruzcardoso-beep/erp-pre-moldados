import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveBackupEnvFile } from "./backup-env.mjs";

const BEGIN_MARKER = "# BEGIN PRECAST ERP BACKUP";
const END_MARKER = "# END PRECAST ERP BACKUP";

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function assertLinuxAbsolutePath(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`${label} precisa ser informado.`);
  }

  if (!value.startsWith("/")) {
    throw new Error(`${label} precisa ser um caminho absoluto Linux.`);
  }

  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} nao pode conter quebra de linha.`);
  }

  return value.replace(/\/+$/, "") || "/";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildNpmCronCommand({ projectPath, scriptName, extraArgs = "", logFile }) {
  const npmCommand = ["npm", "run", scriptName, extraArgs ? "--" : "", extraArgs]
    .filter(Boolean)
    .join(" ");

  return `cd ${shellQuote(projectPath)} && NODE_ENV=production ${npmCommand} >> ${shellQuote(logFile)} 2>&1`;
}

export function buildCronBlock({
  projectPath,
  envFile,
  logDir = "/var/log/precast-erp",
  includeRestoreDrill = false
}) {
  const safeProjectPath = assertLinuxAbsolutePath(projectPath, "projectPath");
  const safeEnvFile = assertLinuxAbsolutePath(envFile, "envFile");
  const safeLogDir = assertLinuxAbsolutePath(logDir, "logDir");
  const envArg = `--env-file ${shellQuote(safeEnvFile)}`;

  const lines = [
    BEGIN_MARKER,
    "SHELL=/bin/bash",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    `50 21 * * * ${buildNpmCronCommand({
      projectPath: safeProjectPath,
      scriptName: "backup:check-config",
      extraArgs: envArg,
      logFile: `${safeLogDir}/backup-config.log`
    })}`,
    `0 22 * * * ${buildNpmCronCommand({
      projectPath: safeProjectPath,
      scriptName: "backup:full:local",
      extraArgs: envArg,
      logFile: `${safeLogDir}/backup-full.log`
    })}`,
    `20 22 * * * ${buildNpmCronCommand({
      projectPath: safeProjectPath,
      scriptName: "backup:check-evidence",
      logFile: `${safeLogDir}/backup-evidence.log`
    })}`,
    `0 7 * * 1 ${buildNpmCronCommand({
      projectPath: safeProjectPath,
      scriptName: "backup:readiness",
      extraArgs: envArg,
      logFile: `${safeLogDir}/backup-readiness.log`
    })}`
  ];

  if (includeRestoreDrill) {
    lines.push(
      `0 23 1 * * ${buildNpmCronCommand({
        projectPath: safeProjectPath,
        scriptName: "backup:restore-drill:local",
        extraArgs: envArg,
        logFile: `${safeLogDir}/backup-restore-drill.log`
      })}`,
      `30 23 1 * * ${buildNpmCronCommand({
        projectPath: safeProjectPath,
        scriptName: "backup:check-restore-drill",
        logFile: `${safeLogDir}/backup-restore-evidence.log`
      })}`
    );
  }

  lines.push(END_MARKER);

  return `${lines.join("\n")}\n`;
}

export function mergeManagedCronBlock(existingCron, newBlock) {
  const normalizedExisting = existingCron.trimEnd();
  const pattern = new RegExp(
    `${BEGIN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    "m"
  );

  if (pattern.test(existingCron)) {
    return `${existingCron.replace(pattern, newBlock).trimEnd()}\n`;
  }

  if (!normalizedExisting) return newBlock;
  return `${normalizedExisting}\n\n${newBlock}`;
}

function readCurrentCron() {
  const result = spawnSync("crontab", ["-l"], {
    encoding: "utf8",
    shell: false
  });

  if (result.status === 0) return result.stdout || "";

  const stderr = `${result.stderr || ""}${result.error?.message || ""}`;
  if (result.status === 1 && /no crontab/i.test(stderr)) return "";

  throw new Error(`Nao foi possivel ler o crontab atual: ${stderr || "erro desconhecido"}`);
}

function writeCron(value) {
  const result = spawnSync("crontab", ["-"], {
    input: value,
    encoding: "utf8",
    shell: false
  });

  if (result.status !== 0 || result.error) {
    throw new Error(`Nao foi possivel instalar o crontab: ${result.stderr || result.error?.message || "erro desconhecido"}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const projectPath = getArg(args, "--project-path", "/opt/precast/erp-pre-moldados-prototype");
  const envFile = resolveBackupEnvFile(
    getArg(args, "--backup-env-file", getArg(args, "--env-file")),
    { fallback: "/etc/precast-erp/precast-backup.env" }
  );
  const logDir = getArg(args, "--log-dir", "/var/log/precast-erp");
  const apply = hasFlag(args, "--apply");
  const includeRestoreDrill = hasFlag(args, "--include-restore-drill");
  const block = buildCronBlock({ projectPath, envFile, logDir, includeRestoreDrill });

  console.log("Agendamento Linux de backup do PRECAST ERP");
  console.log(`Projeto: ${projectPath}`);
  console.log(`EnvFile: ${envFile}`);
  console.log(`LogDir: ${logDir}`);
  console.log(`Restore drill mensal: ${includeRestoreDrill ? "incluido" : "nao incluido"}`);
  console.log("");
  console.log("Crie a pasta de logs antes de aplicar:");
  console.log(`sudo mkdir -p ${shellQuote(logDir)} && sudo chown $USER:$USER ${shellQuote(logDir)}`);
  console.log("");
  console.log(block.trimEnd());

  if (!apply) {
    console.log("");
    console.log("Modo dry-run: nenhuma linha foi instalada. Use --apply no CT depois de revisar.");
    return;
  }

  if (process.platform === "win32") {
    throw new Error("--apply so deve ser usado no Linux/Proxmox CT.");
  }

  const mergedCron = mergeManagedCronBlock(readCurrentCron(), block);
  writeCron(mergedCron);
  console.log("");
  console.log("Crontab atualizado com o bloco gerenciado do PRECAST ERP.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
