import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { inputGroupSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("cadastros.manage")) {
    return NextResponse.json({ error: "Você não tem permissão para gerenciar cadastros." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inputGroupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do grupo de insumos." }, { status: 400 });
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const group = await prisma.inputGroup.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        type: input.type,
        defaultFinancialGroupId: input.defaultFinancialGroupId || null,
        controlsStock: input.controlsStock,
        active: input.active,
        note: input.note || null
      },
      create: {
        code: input.code,
        name: input.name,
        type: input.type,
        defaultFinancialGroupId: input.defaultFinancialGroupId || null,
        controlsStock: input.controlsStock,
        active: input.active,
        note: input.note || null
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "InputGroup",
        entityId: group.id,
        newValue: group
      }
    }).catch(() => null);

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Já existe um grupo com este código ou nome." }, { status: 409 });
    }

    return NextResponse.json({ error: "Não foi possível salvar o grupo de insumos." }, { status: 500 });
  }
}
