import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const script = readFileSync(
  path.join(process.cwd(), "scripts", "monitoring", "install-windows-health-monitor.ps1"),
  "utf8"
);

test("Windows health monitor installer is dry-run by default", () => {
  assert.match(script, /\[switch\]\$Apply/);
  assert.match(script, /Modo dry-run/);
  assert.match(script, /Nenhuma tarefa foi registrada/);
});

test("Windows health monitor installer registers a scheduled task only with Apply", () => {
  assert.match(script, /Register-ScheduledTask/);
  assert.match(script, /New-ScheduledTaskTrigger/);
  assert.match(script, /New-ScheduledTaskAction/);
  assert.match(script, /monitoring:check-health/);
});

test("Windows health monitor installer rejects unsafe health URLs", () => {
  assert.match(script, /Assert-HealthcheckUrl/);
  assert.match(script, /https\?:\/\//);
  assert.match(script, /\(token\|key\|secret\|password\|senha\)=/);
});

test("Windows health monitor installer supports configurable interval", () => {
  assert.match(script, /\[int\]\$IntervalMinutes = 5/);
  assert.match(script, /IntervalMinutes minimo: 1/);
  assert.match(script, /New-TimeSpan -Minutes \$IntervalMinutes/);
});
