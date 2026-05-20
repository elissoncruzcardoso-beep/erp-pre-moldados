import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { productSchema } from "@/lib/validations/product";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("produtos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para cadastrar produtos." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revise os campos obrigatorios do produto." },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const item = await prisma.item.create({
      data: {
        code: input.code.trim().toUpperCase(),
        description: input.description.trim(),
        type: input.type,
        group: input.group?.trim() || null,
        unitId: input.unitId,
        controlsStock: input.controlsStock,
        controlsLot: input.controlsLot,
        minimumStock: new Prisma.Decimal(input.minimumStock),
        standardCost: new Prisma.Decimal(input.standardCost),
        active: input.active
      },
      include: {
        unit: true
      }
    });

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          module: "Produtos",
          action: AuditAction.CREATE,
          entity: "Item",
          entityId: item.id,
          newValue: {
            code: item.code,
            description: item.description,
            type: item.type
          }
        }
      })
      .catch(() => null);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe um produto com este codigo." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel cadastrar o produto." }, { status: 500 });
  }
}
