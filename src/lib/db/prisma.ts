import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  const poolMax = Number(process.env.DATABASE_POOL_MAX || "3");
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}
