import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("producao.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para liberar cura automaticamente." }, { status: 403 });
  }

  const result = await autoReleaseCuredBatches({
    userId: session.userId,
    responsible: "Sistema - cura automatica"
  });

  return NextResponse.json(result);
}
