import { Prisma, type PrismaClient } from "@prisma/client";

const DEFAULT_MAX_ATTEMPTS = 3;

function isRetryableTransactionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }

  if (error instanceof Error) {
    return error.message.includes("Transaction write conflict") || error.message.includes("could not serialize");
  }

  return false;
}

export async function serializableTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000
      });
    } catch (error) {
      lastError = error;

      if (!isRetryableTransactionError(error) || attempt === maxAttempts) {
        break;
      }
    }
  }

  throw lastError;
}
