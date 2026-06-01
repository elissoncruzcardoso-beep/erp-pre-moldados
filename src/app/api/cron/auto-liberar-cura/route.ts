import { apiError, apiSuccess, apiUnauthorized } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return apiUnauthorized("Cron nao autorizado.");
  }

  const prisma = getPrisma();
  const cronUserEmail = process.env.CRON_USER_EMAIL || process.env.TELEGRAM_BOT_USER_EMAIL || "admin@erp.local";
  const user = await prisma.user.findUnique({
    where: { email: cronUserEmail }
  });

  if (!user || user.status !== "ACTIVE") {
    return apiError(`Usuario do cron nao encontrado ou inativo: ${cronUserEmail}`, { status: 500 });
  }

  const result = await autoReleaseCuredBatches({
    userId: user.id,
    responsible: "Cron Vercel - cura automatica",
    limit: 200
  });

  return apiSuccess({
    source: "vercel-cron",
    ...result
  });
}
