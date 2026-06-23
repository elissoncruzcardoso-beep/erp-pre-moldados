import { z } from "zod";
import { apiForbidden, apiSuccess, handleApiError } from "@/lib/api/responses";
import { canRunMaintenanceCleanup, requireApiSession } from "@/lib/auth/guards";
import {
  AUDIT_CLEANUP_CONFIRMATION,
  cleanupAuditLogs,
  previewAuditLogRetention
} from "@/lib/audit/retention";
import { getPrisma } from "@/lib/db/prisma";

const auditRetentionSchema = z.object({
  retentionDays: z.coerce.number().int().optional(),
  batchSize: z.coerce.number().int().optional(),
  dryRun: z.coerce.boolean().default(true)
});

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "manutencao.cleanup",
    forbiddenMessage: "Voce nao tem permissao para limpar logs de auditoria."
  });

  if (auth.response) return auth.response;

  if (!canRunMaintenanceCleanup(auth.session)) {
    return apiForbidden("Apenas o Administrador pode executar limpezas de auditoria.");
  }

  try {
    const payload = auditRetentionSchema.parse(await request.json().catch(() => ({})));
    const prisma = getPrisma();

    if (payload.dryRun) {
      const preview = await previewAuditLogRetention(prisma, payload);
      return apiSuccess({ dryRun: true, preview });
    }

    if (request.headers.get("x-cleanup-confirmation") !== AUDIT_CLEANUP_CONFIRMATION) {
      return handleApiError(
        new Error("Confirmacao obrigatoria para limpar logs de auditoria."),
        "Confirmacao obrigatoria para limpar logs de auditoria.",
        {
          context: {
            request,
            module: "Auditoria",
            action: "validar_retencao_auditoria",
            userId: auth.session.userId,
            entity: "AuditLog"
          },
          event: "audit_retention_confirmation_error"
        }
      );
    }

    const result = await cleanupAuditLogs({
      prisma,
      actor: {
        userId: auth.session.userId,
        name: auth.session.name,
        email: auth.session.email
      },
      retentionDays: payload.retentionDays,
      batchSize: payload.batchSize,
      dryRun: false
    });

    return apiSuccess({ cleanup: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel processar a retencao de auditoria.", {
      context: {
        request,
        module: "Auditoria",
        action: "processar_retencao_auditoria",
        userId: auth.session.userId,
        entity: "AuditLog"
      },
      event: "audit_retention_error"
    });
  }
}
