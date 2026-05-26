import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { paymentMethodSchema } from "@/lib/validations/cadastros";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("cadastros.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para gerenciar cadastros." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da forma de pagamento." }, { status: 400 });
  }

  const prisma = getPrisma();

  try {
    const paymentMethod = await prisma.paymentMethod.upsert({
      where: { code: parsed.data.code },
      update: parsed.data,
      create: parsed.data
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Cadastros",
        action: AuditAction.UPDATE,
        entity: "PaymentMethod",
        entityId: paymentMethod.id,
        newValue: paymentMethod
      }
    }).catch(() => null);

    return NextResponse.json({ paymentMethod }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe forma de pagamento com este codigo." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel salvar a forma de pagamento." }, { status: 500 });
  }
}
