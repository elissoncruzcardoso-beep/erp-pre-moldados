import { z } from "zod";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "A senha precisa ter pelo menos 12 caracteres.")
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("Setup do administrador desativado em producao.", { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Informe um e-mail valido e uma senha com pelo menos 12 caracteres.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      role: {
        select: {
          name: true
        }
      }
    }
  });

  if (!user || user.role.name !== "Administrador") {
    return apiError("Administrador inicial nao encontrado.", { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(parsed.data.password),
      status: "ACTIVE"
    }
  });

  return apiSuccess({
    reset: Boolean(user.passwordHash),
    user: {
      name: user.name,
      email: user.email
    }
  });
}
