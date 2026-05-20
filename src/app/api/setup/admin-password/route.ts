import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "A senha precisa ter pelo menos 12 caracteres.")
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe um e-mail valido e uma senha com pelo menos 12 caracteres." },
      { status: 400 }
    );
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
    return NextResponse.json({ error: "Administrador inicial nao encontrado." }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(parsed.data.password),
      status: "ACTIVE"
    }
  });

  return NextResponse.json({
    ok: true,
    reset: Boolean(user.passwordHash),
    user: {
      name: user.name,
      email: user.email
    }
  });
}
