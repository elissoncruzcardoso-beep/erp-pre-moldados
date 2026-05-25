import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Cron nao autorizado." }, { status: 401 });
  }

  const prisma = getPrisma();
  const cronUserEmail = process.env.CRON_USER_EMAIL || process.env.TELEGRAM_BOT_USER_EMAIL || "admin@erp.local";
  const user = await prisma.user.findUnique({
    where: { email: cronUserEmail }
  });

  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Usuario do cron nao encontrado ou inativo: ${cronUserEmail}` },
      { status: 500 }
    );
  }

  const result = await autoReleaseCuredBatches({
    userId: user.id,
    responsible: "Cron Vercel - cura automatica",
    limit: 200
  });

  return NextResponse.json({
    ok: true,
    source: "vercel-cron",
    ...result
  });
}
