import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { userSchema } from "@/lib/validations/user";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("usuarios.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para criar usuarios." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = userSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise nome, e-mail, senha, perfil e status." }, { status: 400 });
  }

  const prisma = getPrisma();
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });

  if (!role) {
    return NextResponse.json({ error: "Perfil informado nao existe." }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        department: parsed.data.department || null,
        roleId: parsed.data.roleId,
        status: parsed.data.status,
        passwordHash: hashPassword(parsed.data.password)
      },
      include: { role: true }
    });

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          module: "Usuarios",
          action: AuditAction.CREATE,
          entity: "User",
          entityId: user.id,
          newValue: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
            status: user.status,
            department: user.department
          }
        }
      })
      .catch(() => null);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe usuario com este e-mail." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel criar o usuario." }, { status: 500 });
  }
}
