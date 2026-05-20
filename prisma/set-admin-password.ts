import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

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
