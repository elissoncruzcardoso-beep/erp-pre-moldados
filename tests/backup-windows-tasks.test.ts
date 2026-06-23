import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const script = readFileSync(
  path.join(process.cwd(), "scripts", "backup", "install-windows-backup-tasks.ps1"),
  "utf8"
);
const initEnvScript = readFileSync(
  path.join(process.cwd(), "scripts", "backup", "init-backup-env.ps1"),
  "utf8"
);

test("Windows backup task installer is dry-run by default", () => {
  assert.match(script, /\[switch\]\$Apply/);
  assert.match(script, /Modo dry-run/);
  assert.match(script, /Nenhuma tarefa foi registrada/);
});

test("Windows backup task installer registers all expected backup checks", () => {
  assert.match(script, /Backup completo diario/);
  assert.match(script, /Backup incremental/);
  assert.match(script, /Verificacao configuracao backup/);
  assert.match(script, /Verificacao evidencia backup/);
  assert.match(script, /Verificacao postura S3/);
  assert.match(script, /Verificacao restore drill/);
  assert.match(script, /Register-ScheduledTask/);
  assert.match(script, /--env-file/);
  assert.match(script, /--write-evidence/);
});

test("Windows backup task installer does not embed secret names or credentials", () => {
  assert.doesNotMatch(script, /AWS_SECRET_ACCESS_KEY\s*=/);
  assert.doesNotMatch(script, /postgresql:\/\/[^"'\s]+:[^@"'\s]+@/);
});

test("restore drill records safe evidence without printing the full database URL", () => {
  const restoreScript = readFileSync(
    path.join(process.cwd(), "scripts", "backup", "restore-drill.ps1"),
    "utf8"
  );

  assert.match(restoreScript, /EvidencePath/);
  assert.match(restoreScript, /sourceBackup/);
  assert.match(restoreScript, /Get-Safe-Restore-Target/);
  assert.doesNotMatch(restoreScript, /Banco de teste preservado para conferencias: \$restoreUrl/);
});

test("backup env initializer is dry-run by default and requires Apply to write", () => {
  assert.match(initEnvScript, /\[switch\]\$Apply/);
  assert.match(initEnvScript, /Modo dry-run/);
  assert.match(initEnvScript, /Copy-Item/);
});

test("backup env initializer blocks destination inside repository", () => {
  assert.match(initEnvScript, /Assert-OutsideProject/);
  assert.match(initEnvScript, /EnvFile precisa ficar fora do repositorio/);
  assert.match(initEnvScript, /StartsWith\(\$projectFull/);
});

test("backup env initializer does not overwrite without Force", () => {
  assert.match(initEnvScript, /\[switch\]\$Force/);
  assert.match(initEnvScript, /Arquivo ja existe/);
});
