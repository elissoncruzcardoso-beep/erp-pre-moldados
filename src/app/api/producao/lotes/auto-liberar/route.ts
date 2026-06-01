import { apiSuccess } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

export async function POST() {
  const auth = await requireApiSession({
    permission: "producao.manage",
    forbiddenMessage: "Voce nao tem permissao para liberar cura automaticamente."
  });

  if (auth.response) return auth.response;

  const result = await autoReleaseCuredBatches({
    userId: auth.session.userId,
    responsible: "Sistema - cura automatica"
  });

  return apiSuccess(result);
}
