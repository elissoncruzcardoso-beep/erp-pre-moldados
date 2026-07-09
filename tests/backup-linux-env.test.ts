import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEnvFileOutsideProject,
  buildInitCliPlan,
  buildInitPlan
} from "../scripts/backup/init-linux-backup-env.mjs";

const projectPath = "/opt/precast/erp-pre-moldados-prototype";
const envFile = "/etc/precast-erp/precast-backup.env";

test("Linux backup env initializer is dry-run by default", () => {
  const plan = buildInitCliPlan([
    "--project-path",
    projectPath,
    "--backup-env-file",
    envFile
  ]);

  assert.equal(plan.apply, false);
  assert.equal(plan.force, false);
  assert.equal(plan.envFile, envFile);
  assert.doesNotMatch(JSON.stringify(plan), /postgresql:\/\/[^"'\s]+:[^@"'\s]+@/);
});

test("Linux backup env initializer builds plan with external target", () => {
  const plan = buildInitPlan({ projectPath, envFile });

  assert.equal(plan.projectPath, projectPath);
  assert.equal(plan.envFile, envFile);
  assert.equal(plan.targetDir, "/etc/precast-erp");
  assert.match(plan.templatePath.replace(/\\/g, "/"), /docs\/security\/backups\/precast-backup\.env\.template$/);
});

test("Linux backup env initializer rejects env file inside project checkout", () => {
  assert.throws(
    () => assertEnvFileOutsideProject({
      projectPath,
      envFile: "/opt/precast/erp-pre-moldados-prototype/.env"
    }),
    /fora do checkout do projeto/
  );
});

test("Linux backup env initializer rejects relative paths", () => {
  assert.throws(
    () => buildInitPlan({ projectPath: "erp-pre-moldados-prototype", envFile }),
    /projectPath precisa ser um caminho absoluto Linux/
  );

  assert.throws(
    () => buildInitPlan({ projectPath, envFile: "precast-backup.env" }),
    /envFile precisa ser um caminho absoluto Linux/
  );
});
