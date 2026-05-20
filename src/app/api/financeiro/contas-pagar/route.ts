import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { accountPayableSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("financeiro.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar contas a pagar." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountPayableSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da conta a pagar." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const payable = await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.findUnique({
        where: { id: input.purchaseReceiptId },
        include: {
          accountPayable: true,
          purchaseOrder: {
            include: {
              supplier: true
            }
          },
          purchaseOrderItem: {
            include: {
              item: true
            }
          }
        }
      });

      if (!receipt) {
        throw new Error("RECEIPT_NOT_FOUND");
      }

      if (receipt.status === "CANCELADO") {
        throw new Error("RECEIPT_CANCELED");
      }

      if (receipt.accountPayable) {
        throw new Error("PAYABLE_ALREADY_EXISTS");
      }

      if (receipt.acceptedQuantity.lessThanOrEqualTo(0)) {
        throw new Error("RECEIPT_WITHOUT_VALUE");
      }

      const created = await tx.accountPayable.create({
        data: {
          number: input.number.trim().toUpperCase(),
          purchaseReceiptId: receipt.id,
          supplierId: receipt.purchaseOrder.supplierId,
          createdById: session.userId,
          description: `NF ${receipt.invoiceNumber || receipt.number} - ${receipt.purchaseOrderItem.item.description}`,
          documentNumber: receipt.invoiceNumber || receipt.number,
          costCenter: input.costCenter?.trim() || null,
          dueDate: input.dueDate,
          amount: receipt.totalCost,
          note: input.note?.trim() || null
        },
        include: {
          supplier: true,
          purchaseReceipt: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Financeiro",
          action: AuditAction.CREATE,
          entity: "AccountPayable",
          entityId: created.id,
          newValue: {
            number: created.number,
            supplier: created.supplier.name,
            receipt: created.purchaseReceipt.number,
            dueDate: created.dueDate.toISOString(),
            amount: created.amount.toString(),
            status: created.status
          }
        }
      });

      return created;
    });

    return NextResponse.json({ payable }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma conta a pagar com este numero ou recebimento." }, { status: 409 });
    }

    const messages: Record<string, string> = {
      RECEIPT_NOT_FOUND: "Recebimento nao encontrado.",
      RECEIPT_CANCELED: "Recebimento cancelado nao pode gerar conta a pagar.",
      PAYABLE_ALREADY_EXISTS: "Este recebimento ja possui conta a pagar.",
      RECEIPT_WITHOUT_VALUE: "Recebimento sem quantidade aceita nao gera conta a pagar."
    };

    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel criar a conta a pagar.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
