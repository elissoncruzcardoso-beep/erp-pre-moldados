import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { financialSettlementTypeSchema } from "@/lib/validations/cadastros";

async function requireManageSession() {
  const session = await getSession();

  if (!session) {
    return { error: NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 }) };
  }

  if (!session.permissions.includes("cadastros.manage")) {
    return { error: NextResponse.json({ error: "Voce nao tem permissao para gerenciar cadastros." }, { status: 403 }) };
  }

  return { session };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = financialSettlementTypeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do tipo de baixa." }, { status: 400 });
  }

  const prisma = getPrisma();

  try {
    const settlementType = await prisma.financialSettlementType.update({
      where: { id },
      data: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "FinancialSettlementType",
        entityId: settlementType.id,
        newValue: settlementType
      }
    }).catch(() => null);

    return NextResponse.json({ settlementType });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe tipo de baixa com este codigo." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel atualizar o tipo de baixa." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireManageSession();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const prisma = getPrisma();
  const current = await prisma.financialSettlementType.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ error: "Tipo de baixa nao encontrado." }, { status: 404 });
  }

  const settlementType = await prisma.financialSettlementType.update({
    where: { id },
    data: { active: !current.active }
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.userId,
      module: "Cadastros",
      action: AuditAction.UPDATE,
      entity: "FinancialSettlementType",
      entityId: settlementType.id,
      newValue: { active: settlementType.active }
    }
  }).catch(() => null);

  return NextResponse.json({ settlementType });
}
