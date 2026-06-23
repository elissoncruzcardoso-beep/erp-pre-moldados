import { AuditAction, Prisma, type PrismaClient } from "@prisma/client";
import { serializableTransaction } from "@/lib/db/transactions";

const DAY_MS = 86_400_000;

export const DEFAULT_AUDIT_RETENTION_DAYS = 730;
export const MIN_AUDIT_RETENTION_DAYS = 180;
export const MAX_AUDIT_RETENTION_DAYS = 3650;
export const DEFAULT_AUDIT_CLEANUP_BATCH_SIZE = 1000;
export const MAX_AUDIT_CLEANUP_BATCH_SIZE = 5000;
export const AUDIT_CLEANUP_CONFIRMATION = "LIMPAR_AUDITORIA";
export const PRESERVED_AUDIT_ACTIONS = [AuditAction.PERMISSION_CHANGE];

type AuditRetentionInput = {
  retentionDays?: number;
  batchSize?: number;
  now?: Date;
};

type AuditRetentionOptions = {
  retentionDays: number;
  batchSize: number;
  cutoff: Date;
  preserveActions: AuditAction[];
};

type AuditActor = {
  userId?: string;
  name?: string;
  email?: string;
};

export type AuditRetentionPreview = {
  retentionDays: number;
  batchSize: number;
  cutoff: string;
  preservedActions: AuditAction[];
  eligibleCount: number;
  oldestLogAt: string | null;
  newestLogAt: string | null;
  byModule: Array<{ module: string; count: number }>;
  byAction: Array<{ action: AuditAction; count: number }>;
};

export function normalizeAuditRetentionOptions(input: AuditRetentionInput = {}): AuditRetentionOptions {
  const retentionDays = Number(input.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS);
  const batchSize = Number(input.batchSize ?? DEFAULT_AUDIT_CLEANUP_BATCH_SIZE);

  if (!Number.isInteger(retentionDays)) {
    throw new Error("retentionDays precisa ser um numero inteiro.");
  }

  if (retentionDays < MIN_AUDIT_RETENTION_DAYS || retentionDays > MAX_AUDIT_RETENTION_DAYS) {
    throw new Error(
      `retentionDays precisa ficar entre ${MIN_AUDIT_RETENTION_DAYS} e ${MAX_AUDIT_RETENTION_DAYS} dias.`
    );
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_AUDIT_CLEANUP_BATCH_SIZE) {
    throw new Error(`batchSize precisa ficar entre 1 e ${MAX_AUDIT_CLEANUP_BATCH_SIZE}.`);
  }

  const now = input.now ?? new Date();

  return {
    retentionDays,
    batchSize,
    cutoff: new Date(now.getTime() - retentionDays * DAY_MS),
    preserveActions: PRESERVED_AUDIT_ACTIONS
  };
}

export function buildAuditRetentionWhere(options: Pick<AuditRetentionOptions, "cutoff" | "preserveActions">) {
  return {
    createdAt: { lt: options.cutoff },
    action: { notIn: options.preserveActions }
  } satisfies Prisma.AuditLogWhereInput;
}

function countModuleRows(rows: Array<{ module: string; _count: { _all: number } }>) {
  return rows
    .map((row) => ({ module: row.module, count: row._count._all }))
    .sort((left, right) => right.count - left.count);
}

function countActionRows(rows: Array<{ action: AuditAction; _count: { _all: number } }>) {
  return rows
    .map((row) => ({ action: row.action, count: row._count._all }))
    .sort((left, right) => right.count - left.count);
}

export async function previewAuditLogRetention(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: AuditRetentionInput = {}
): Promise<AuditRetentionPreview> {
  const options = normalizeAuditRetentionOptions(input);
  const where = buildAuditRetentionWhere(options);

  const [eligibleCount, oldestLog, newestLog, byModule, byAction] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
    }),
    prisma.auditLog.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    prisma.auditLog.groupBy({
      by: ["module"],
      where,
      _count: { _all: true }
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where,
      _count: { _all: true }
    })
  ]);

  return {
    retentionDays: options.retentionDays,
    batchSize: options.batchSize,
    cutoff: options.cutoff.toISOString(),
    preservedActions: options.preserveActions,
    eligibleCount,
    oldestLogAt: oldestLog?.createdAt.toISOString() ?? null,
    newestLogAt: newestLog?.createdAt.toISOString() ?? null,
    byModule: countModuleRows(byModule),
    byAction: countActionRows(byAction)
  };
}

export async function cleanupAuditLogs({
  prisma,
  actor,
  retentionDays,
  batchSize,
  dryRun = true
}: {
  prisma: PrismaClient;
  actor?: AuditActor;
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
}) {
  const options = normalizeAuditRetentionOptions({ retentionDays, batchSize });
  const preview = await previewAuditLogRetention(prisma, {
    retentionDays: options.retentionDays,
    batchSize: options.batchSize
  });

  if (dryRun) {
    return {
      dryRun: true,
      deletedCount: 0,
      preview
    };
  }

  const result = await serializableTransaction(prisma, async (tx) => {
    const where = buildAuditRetentionWhere(options);
    const logsToDelete = await tx.auditLog.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: options.batchSize
    });

    const deleted = logsToDelete.length
      ? await tx.auditLog.deleteMany({
          where: { id: { in: logsToDelete.map((log) => log.id) } }
        })
      : { count: 0 };

    await tx.auditLog.create({
      data: {
        userId: actor?.userId,
        module: "Auditoria",
        action: AuditAction.DELETE,
        entity: "AuditLogRetention",
        entityId: "audit-retention",
        previousValue: {
          eligibleCount: preview.eligibleCount,
          cutoff: preview.cutoff,
          preservedActions: preview.preservedActions
        },
        newValue: {
          deletedCount: deleted.count,
          batchSize: options.batchSize,
          retentionDays: options.retentionDays,
          operator: actor ? { name: actor.name, email: actor.email } : "sistema"
        },
        justification: "Limpeza controlada de logs antigos de auditoria"
      }
    });

    return deleted.count;
  });

  return {
    dryRun: false,
    deletedCount: result,
    preview
  };
}
