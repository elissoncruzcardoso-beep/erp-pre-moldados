import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_DAYS = 3650;
const BACKUP_FILE_PATTERN = /\.dump(?:\.sha256)?$/;

export function resolveBackupRetentionDays(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;

  if (!/^\d+$/.test(normalized)) {
    throw new Error("BACKUP_RETENTION_DAYS deve ser um numero inteiro de dias.");
  }

  const days = Number.parseInt(normalized, 10);
  if (days < 1 || days > MAX_RETENTION_DAYS) {
    throw new Error(`BACKUP_RETENTION_DAYS deve ficar entre 1 e ${MAX_RETENTION_DAYS}.`);
  }

  return days;
}

export function pruneExpiredLocalBackups({
  outputDir,
  retentionDays,
  preservePaths = [],
  now = new Date()
}) {
  if (!retentionDays) {
    return { retentionDays: null, removedFiles: [] };
  }

  const fullBackupDir = path.resolve(outputDir, "full");
  if (!existsSync(fullBackupDir)) {
    return { retentionDays, removedFiles: [] };
  }

  const cutoffMs = now.getTime() - retentionDays * DAY_MS;
  const preserved = new Set(preservePaths.map((filePath) => path.resolve(filePath)));
  const removedFiles = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(candidate);
        continue;
      }

      if (!entry.isFile() || !BACKUP_FILE_PATTERN.test(entry.name)) continue;

      const resolvedCandidate = path.resolve(candidate);
      if (preserved.has(resolvedCandidate)) continue;
      if (statSync(resolvedCandidate).mtimeMs >= cutoffMs) continue;

      unlinkSync(resolvedCandidate);
      removedFiles.push(resolvedCandidate);
    }
  }

  visit(fullBackupDir);

  return { retentionDays, removedFiles };
}
