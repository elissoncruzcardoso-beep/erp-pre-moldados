import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { accountPaymentSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("financeiro.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para baixar contas a pagar." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountPaymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do pagamento." }, { status: 400 });
  }

  const input = parsed.data;
  const amount = new Prisma.Decimal(input.amount);
  const prisma = getPrisma();

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const payable = await tx.accountPayable.findUnique({
        where: { id: input.accountPayableId },
        include: {
          supplier: true,
          payments: true
        }
      });

      if (!payable) {
        throw new Error("PAYABLE_NOT_FOUND");
      }

      if (payable.status === "CANCELADO" || payable.status === "PAGO") {
        throw new Error("PAYABLE_CLOSED");
      }

      const alreadyPaid = payable.payments.reduce(
        (sum, paymentRow) => sum.plus(paymentRow.amount),
        new Prisma.Decimal(0)
      );
      const remaining = payable.amount.minus(alreadyPaid);

      if (amount.greaterThan(remaining)) {
        throw new Error("PAYMENT_EXCEEDS_BALANCE");
      }

      const created = await tx.accountPayment.create({
        data: {
          accountPayableId: payable.id,
          paidById: session.userId,
          paymentDate: input.paymentDate,
          amount,
          method: input.method.trim(),
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null
        },
        include: {
          accountPayable: true,
          paidBy: true
        }
      });

      const nextPaidAmount = alreadyPaid.plus(amount);
      const fullyPaid = nextPaidAmount.greaterThanOrEqualTo(payable.amount);

      await tx.accountPayable.update({
        where: { id: payable.id },
        data: {
          paidAmount: nextPaidAmount,
          paidAt: fullyPaid ? input.paymentDate : null,
          status: fullyPaid ? "PAGO" : "PROGRAMADO"
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Financeiro",
          action: AuditAction.UPDATE,
          entity: "AccountPayable",
          entityId: payable.id,
          previousValue: {
            status: payable.status,
            paidAmount: payable.paidAmount.toString()
          },
          newValue: {
            status: fullyPaid ? "PAGO" : "PROGRAMADO",
            paidAmount: nextPaidAmount.toString(),
            paymentAmount: created.amount.toString(),
            method: created.method,
            reference: created.reference
          }
        }
      });

      return created;
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = {
      PAYABLE_NOT_FOUND: "Conta a pagar nao encontrada.",
      PAYABLE_CLOSED: "Conta cancelada ou ja paga nao pode receber baixa.",
      PAYMENT_EXCEEDS_BALANCE: "Valor pago ultrapassa o saldo do titulo."
    };

    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel registrar o pagamento.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
