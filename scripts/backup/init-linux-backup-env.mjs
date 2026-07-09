import {
  chmodSync,
  chownSync,
  copyFileSync,
  existsSync,
  mkdirSync
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

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

function normalizeLinuxPath(value, label = "path") {
  return assertLinuxAbsolutePath(value, label).replace(/\/+/g, "/");
}

function resolveTemplatePath(templatePath) {
  if (!templatePath || /[\r\n]/.test(templatePath)) {
    throw new Error("templatePath invalido.");
  }

  return path.isAbsolute(templatePath)
    ? templatePath
    : path.resolve(root, templatePath);
}

function getSudoOwner() {
  const uid = Number.parseInt(process.env.SUDO_UID || "", 10);
  const gid = Number.parseInt(process.env.SUDO_GID || "", 10);

  return Number.isInteger(uid) && Number.isInteger(gid)
    ? { uid, gid }
    : null;
}

export function assertEnvFileOutsideProject({ projectPath, envFile }) {
  const normalizedProject = `${normalizeLinuxPath(projectPath).replace(/\/+$/, "")}/`;
  const normalizedEnv = normalizeLinuxPath(envFile, "envFile");

  if (`${normalizedEnv}/`.startsWith(normalizedProject)) {
    throw new Error("EnvFile precisa ficar fora do checkout do projeto.");
  }
}

export function buildInitPlan({
  projectPath = "/opt/precast/erp-pre-moldados-prototype",
  envFile = "/etc/precast-erp/precast-backup.env",
  templatePath = "docs/security/backups/precast-backup.env.template"
} = {}) {
  const safeProjectPath = normalizeLinuxPath(projectPath, "projectPath");
  const safeEnvFile = normalizeLinuxPath(envFile, "envFile");
  const resolvedTemplatePath = resolveTemplatePath(templatePath);

  assertEnvFileOutsideProject({
    projectPath: safeProjectPath,
    envFile: safeEnvFile
  });

  return {
    projectPath: safeProjectPath,
    envFile: safeEnvFile,
    templatePath: resolvedTemplatePath,
    targetDir: path.posix.dirname(safeEnvFile)
  };
}

export function buildInitCliPlan(args = []) {
  return {
    ...buildInitPlan({
      projectPath: getArg(args, "--project-path", "/opt/precast/erp-pre-moldados-prototype"),
      envFile: getArg(args, "--backup-env-file", "/etc/precast-erp/precast-backup.env"),
      templatePath: getArg(args, "--template-path", "docs/security/backups/precast-backup.env.template")
    }),
    apply: hasFlag(args, "--apply"),
    force: hasFlag(args, "--force")
  };
}

function main() {
  const args = process.argv.slice(2);
  const plan = buildInitCliPlan(args);
  const { apply, force } = plan;

  console.log("Inicializacao Linux do arquivo externo de backup do PRECAST ERP");
  console.log(`Projeto: ${plan.projectPath}`);
  console.log(`Template: ${plan.templatePath}`);
  console.log(`Destino externo: ${plan.envFile}`);
  console.log(`Aplicar: ${apply}`);

  if (!existsSync(plan.templatePath)) {
    throw new Error(`Template nao encontrado: ${plan.templatePath}`);
  }

  if (!apply) {
    console.log("");
    console.log("Modo dry-run: nenhum arquivo foi criado.");
    console.log("No CT, revise e rode novamente com --apply.");
    console.log("Depois edite o arquivo externo e preencha os valores reais.");
    console.log("");
    console.log("Comandos uteis no CT:");
    console.log(`sudo mkdir -p ${plan.targetDir} /var/backups/precast-erp`);
    console.log(`sudo chmod 700 ${plan.targetDir} /var/backups/precast-erp`);
    console.log(`npm run backup:init-linux-env -- --backup-env-file ${plan.envFile} --apply`);
    return;
  }

  if (process.platform === "win32") {
    throw new Error("--apply so deve ser usado no Linux/Proxmox CT.");
  }

  if (existsSync(plan.envFile) && !force) {
    throw new Error(`Arquivo ja existe. Use --force somente se quiser substituir conscientemente: ${plan.envFile}`);
  }

  mkdirSync(plan.targetDir, { recursive: true, mode: 0o700 });
  copyFileSync(plan.templatePath, plan.envFile);
  chmodSync(plan.targetDir, 0o700);
  chmodSync(plan.envFile, 0o600);

  const sudoOwner = getSudoOwner();
  if (sudoOwner) {
    chownSync(plan.targetDir, sudoOwner.uid, sudoOwner.gid);
    chownSync(plan.envFile, sudoOwner.uid, sudoOwner.gid);
  }

  console.log("");
  console.log("Arquivo externo criado.");
  console.log("Permissoes aplicadas: diretorio 700 e arquivo 600.");
  console.log("Edite o arquivo fora do repositorio e preencha as credenciais reais.");
  console.log("Para validar depois:");
  console.log(`npm run backup:check-config -- --env-file ${plan.envFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`ERRO - ${error.message}`);
    process.exit(1);
  }
}
