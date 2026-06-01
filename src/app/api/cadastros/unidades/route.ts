import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { unitOfMeasureSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "cadastros.manage",
    forbiddenMessage: "Voce nao tem permissao para gerenciar cadastros."
  });

  if (auth.response) return auth.response;

  const { session } = auth;
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
      return NextResponse.json({ error: "Ja existe uma unidade com este codigo." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel salvar a unidade." }, { status: 500 });
  }
}
