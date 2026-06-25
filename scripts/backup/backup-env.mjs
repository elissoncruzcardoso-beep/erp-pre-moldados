import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function getDefaultExternalBackupEnvFile() {
  return process.platform === "win32"
    ? "C:\\seguro\\precast-backup.env"
    : "/etc/precast-erp/precast-backup.env";
}

export function resolveBackupEnvFile(explicitValue, {
  fallback = ".env"
} = {}) {
  return (
    explicitValue ||
    process.env.PRECAST_BACKUP_ENV_FILE ||
    process.env.BACKUP_ENV_FILE ||
    fallback
  );
}

export function resolveEnvFilePath(file, {
  root = process.cwd()
} = {}) {
  const isWindowsAbsolute = (value) => /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  if (path.isAbsolute(file) || isWindowsAbsolute(file)) return file;

  return isWindowsAbsolute(root) ? path.win32.resolve(root, file) : path.resolve(root, file);
}

export function loadDotEnv(file, {
  root = process.cwd()
} = {}) {
  const envPath = resolveEnvFilePath(file, { root });
  if (!existsSync(envPath)) return false;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }

  return true;
}
