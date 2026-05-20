import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { accountReceiptSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("financeiro.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para baixar contas a receber." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountReceiptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do recebimento." }, { status: 400 });
  }

  const input = parsed.data;
  const amount = new Prisma.Decimal(input.amount);
  const prisma = getPrisma();

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const receivable = await tx.accountReceivable.findUnique({
        where: { id: input.accountReceivableId },
        include: {
          customer: true,
          receipts: true
        }
      });

      if (!receivable) {
        throw new Error("RECEIVABLE_NOT_FOUND");
      }

      if (receivable.status === "CANCELADO" || receivable.status === "RECEBIDO") {
        throw new Error("RECEIVABLE_CLOSED");
      }

      const alreadyReceived = receivable.receipts.reduce(
        (sum, row) => sum.plus(row.amount),
        new Prisma.Decimal(0)
      );
      const remaining = receivable.amount.minus(alreadyReceived);

      if (amount.greaterThan(remaining)) {
        throw new Error("RECEIPT_EXCEEDS_BALANCE");
      }

      const created = await tx.accountReceipt.create({
        data: {
          accountReceivableId: receivable.id,
          receivedById: session.userId,
          receiptDate: input.receiptDate,
          amount,
          method: input.method.trim(),
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null
        },
        include: {
          accountReceivable: true,
          receivedBy: true
        }
      });

      const nextReceivedAmount = alreadyReceived.plus(amount);
      const fullyReceived = nextReceivedAmount.greaterThanOrEqualTo(receivable.amount);

      await tx.accountReceivable.update({
        where: { id: receivable.id },
        data: {
          receivedAmount: nextReceivedAmount,
          receivedAt: fullyReceived ? input.receiptDate : null,
          status: fullyReceived ? "RECEBIDO" : "FATURADO"
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Financeiro",
          action: AuditAction.UPDATE,
          entity: "AccountReceivable",
          entityId: receivable.id,
          previousValue: {
            status: receivable.status,
            receivedAmount: receivable.receivedAmount.toString()
          },
          newValue: {
            status: fullyReceived ? "RECEBIDO" : "FATURADO",
            receivedAmount: nextReceivedAmount.toString(),
            receiptAmount: created.amount.toString(),
            method: created.method,
            reference: created.reference
          }
        }
      });

      return created;
    });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = {
      RECEIVABLE_NOT_FOUND: "Conta a receber nao encontrada.",
      RECEIVABLE_CLOSED: "Conta cancelada ou ja recebida nao pode receber baixa.",
      RECEIPT_EXCEEDS_BALANCE: "Valor recebido ultrapassa o saldo do titulo."
    };

    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel registrar o recebimento.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
