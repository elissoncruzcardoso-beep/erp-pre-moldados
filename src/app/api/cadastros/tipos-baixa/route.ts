import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { financialSettlementTypeSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("cadastros.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para gerenciar cadastros." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = financialSettlementTypeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do tipo de baixa." }, { status: 400 });
  }

  const prisma = getPrisma();

  try {
    const settlementType = await prisma.financialSettlementType.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "FinancialSettlementType",
        entityId: settlementType.id,
        newValue: settlementType
      }
    }).catch(() => null);

    return NextResponse.json({ settlementType }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe tipo de baixa com este codigo." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel salvar o tipo de baixa." }, { status: 500 });
  }
}
