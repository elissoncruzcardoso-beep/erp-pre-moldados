import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { accountReceivableSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("financeiro.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar contas a receber." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountReceivableSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da conta a receber." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const receivable = await prisma.accountReceivable.create({
      data: {
        number: input.number.trim().toUpperCase(),
        customerId: input.customerId,
        createdById: session.userId,
        description: input.description.trim(),
        documentNumber: input.documentNumber?.trim() || null,
        costCenter: input.costCenter?.trim() || null,
        dueDate: input.dueDate,
        amount: new Prisma.Decimal(input.amount),
        note: input.note?.trim() || null
      },
      include: {
        customer: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        module: "Financeiro",
        action: AuditAction.CREATE,
        entity: "AccountReceivable",
        entityId: receivable.id,
        newValue: {
          number: receivable.number,
          customer: receivable.customer.name,
          dueDate: receivable.dueDate.toISOString(),
          amount: receivable.amount.toString(),
          status: receivable.status
        }
      }
    });

    return NextResponse.json({ receivable }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma conta a receber com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel criar a conta a receber." }, { status: 400 });
  }
}
