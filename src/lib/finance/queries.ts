import type { Prisma, PrismaClient } from "@prisma/client";

export function activeAccountReceiptWhere(): Prisma.AccountReceiptWhereInput {
  return {
    accountReceivable: {
      status: { not: "CANCELADO" }
    }
  };
}

export function findRecentActiveAccountReceipts(prisma: PrismaClient, take = 8) {
  return prisma.accountReceipt.findMany({
    where: activeAccountReceiptWhere(),
    include: {
      accountReceivable: {
        include: {
          customer: true
        }
      },
      receivedBy: true
    },
    orderBy: { receiptDate: "desc" },
    take
  });
}
