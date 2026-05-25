import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL nao configurada.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  })
});

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@erp.local";
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error("Defina ADMIN_PASSWORD com pelo menos 12 caracteres antes de rodar o script.");
  }

  const user = await prisma.user.update({
    where: { email },
    data: {
      passwordHash: hashPassword(password),
      status: "ACTIVE"
    },
    select: {
      email: true,
      name: true
    }
  });

  console.log(`Senha inicial definida para ${user.name} (${user.email}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
