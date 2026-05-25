import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { unitOfMeasureSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("cadastros.manage")) {
    return NextResponse.json({ error: "Você não tem permissão para gerenciar cadastros." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = unitOfMeasureSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da unidade de medida." }, { status: 400 });
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const unit = await prisma.unitOfMeasure.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        decimals: input.decimals
      },
      create: {
        code: input.code,
        name: input.name,
        decimals: input.decimals
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "UnitOfMeasure",
        entityId: unit.id,
        newValue: unit
      }
    }).catch(() => null);

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma unidade com este código." }, { status: 409 });
    }

    return NextResponse.json({ error: "Não foi possível salvar a unidade." }, { status: 500 });
  }
}
