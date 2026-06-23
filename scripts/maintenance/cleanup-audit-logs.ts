import { cleanupAuditLogs, AUDIT_CLEANUP_CONFIRMATION } from "../../src/lib/audit/retention";
import { getPrisma } from "../../src/lib/db/prisma";

function getArg(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const jsonOutput = process.argv.includes("--json");
  const confirmation = getArg("--confirm");
  const retentionDays = getArg("--retention-days");
  const batchSize = getArg("--batch-size");

  if (execute && confirmation !== AUDIT_CLEANUP_CONFIRMATION) {
    throw new Error(`Para executar de verdade, use --confirm ${AUDIT_CLEANUP_CONFIRMATION}.`);
  }

  const result = await cleanupAuditLogs({
    prisma: getPrisma(),
    actor: {
      name: "Manutencao CLI",
      email: process.env.CRON_USER_EMAIL || "sistema"
    },
    retentionDays: retentionDays ? Number(retentionDays) : undefined,
    batchSize: batchSize ? Number(batchSize) : undefined,
    dryRun: !execute
  });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(execute ? "Limpeza de auditoria executada" : "Previa de limpeza de auditoria");
  console.log(`Retencao: ${result.preview.retentionDays} dia(s)`);
  console.log(`Corte: ${result.preview.cutoff}`);
  console.log(`Elegiveis: ${result.preview.eligibleCount}`);
  console.log(`Removidos: ${result.deletedCount}`);

  if (!execute) {
    console.log(`Para executar: npm run maintenance:audit-retention -- --execute --confirm ${AUDIT_CLEANUP_CONFIRMATION}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
