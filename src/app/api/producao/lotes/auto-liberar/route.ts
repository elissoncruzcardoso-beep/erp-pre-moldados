import { apiSuccess, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "producao.manage",
    forbiddenMessage: "Voce nao tem permissao para liberar cura automaticamente."
  });

  if (auth.response) return auth.response;

  try {
    const result = await autoReleaseCuredBatches({
      userId: auth.session.userId,
      responsible: "Sistema - cura automatica"
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error, "Nao foi possivel liberar os lotes em cura automaticamente.", {
      context: {
        request,
        module: "Producao",
        action: "auto_liberar_cura",
        userId: auth.session.userId,
        entity: "ProductionBatch"
      },
      event: "production_auto_release_error"
    });
  }
}
