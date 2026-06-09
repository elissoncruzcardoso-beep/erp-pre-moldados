import { Prisma } from "@prisma/client";

function nextCodeFromNumbers(prefix: string, numbers: string[]) {
  const sequentialPattern = new RegExp(`^${prefix}-(\\d+)$`);
  const lastSequentialNumber = numbers.reduce((last, number) => {
    const match = number.match(sequentialPattern);
    const sequence = match ? Number(match[1]) : 0;

    return Number.isFinite(sequence) && sequence > last ? sequence : last;
  }, 0);
  const nextSequence = lastSequentialNumber + 1;

  return `${prefix}-${String(nextSequence).padStart(2, "0")}`;
}

export async function makeSupplySequentialCode(tx: Prisma.TransactionClient, prefix: "SC" | "COT" | "PC") {
  const query = {
    where: { number: { startsWith: `${prefix}-` } },
    select: { number: true }
  };
  const records =
    prefix === "SC"
      ? await tx.purchaseRequest.findMany(query)
      : prefix === "COT"
        ? await tx.purchaseQuote.findMany(query)
        : await tx.purchaseOrder.findMany(query);

  return nextCodeFromNumbers(prefix, records.map((record) => record.number));
}

export function makeComparisonMapNumber(requestNumber: string) {
  const match = requestNumber.match(/^SC-(\d+)$/);

  return match ? `MAP-${match[1]}` : `MAP-${requestNumber.replace(/^SC-/, "")}`;
}
