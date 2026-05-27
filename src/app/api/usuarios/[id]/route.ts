import { NextResponse } from "next/server";
import { AuditAction, Prisma, UserStatus } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

const updateUserSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(160),
  roleId: z.string().min(1),
  department: z.string().trim().max(80).optional().nullable(),
  status: z.nativeEnum(UserStatus),
  password: z.string().min(8).max(120).optional().or(z.literal(""))
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("usuarios.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para alterar usuarios." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os dados do usuario." }, { status: 400 });
  }

  if (id === session.userId && parsed.data.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Voce nao pode inativar seu proprio usuario." }, { status: 400 });
  }

  const prisma = getPrisma();
  const [current, role] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { role: true } }),
    prisma.role.findUnique({ where: { id: parsed.data.roleId } })
  ]);

  if (!current) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  if (!role) {
    return NextResponse.json({ error: "Perfil informado nao existe." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        department: parsed.data.department || null,
        roleId: parsed.data.roleId,
        status: parsed.data.status,
        ...(parsed.data.password ? { passwordHash: hashPassword(parsed.data.password) } : {})
      },
      include: { role: true }
    });

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          module: "Usuarios",
          action: AuditAction.UPDATE,
          entity: "User",
          entityId: user.id,
          previousValue: {
            id: current.id,
            name: current.name,
            email: current.email,
            role: current.role.name,
            status: current.status,
            department: current.department
          },
          newValue: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
            status: user.status,
            department: user.department,
            passwordUpdated: Boolean(parsed.data.password)
          }
        }
      })
      .catch(() => null);

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe usuario com este e-mail." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel atualizar o usuario." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("usuarios.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para inativar usuarios." }, { status: 403 });
  }

  const { id } = await context.params;

  if (id === session.userId) {
    return NextResponse.json({ error: "Voce nao pode inativar seu proprio usuario." }, { status: 400 });
  }

  const prisma = getPrisma();
  const current = await prisma.user.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const nextStatus = current.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
  const user = await prisma.user.update({
    where: { id },
    data: { status: nextStatus },
    include: { role: true }
  });

  await prisma.auditLog
    .create({
      data: {
        userId: session.userId,
        module: "Usuarios",
        action: nextStatus === UserStatus.ACTIVE ? AuditAction.UPDATE : AuditAction.DELETE,
        entity: "User",
        entityId: user.id,
        previousValue: { status: current.status },
        newValue: { status: user.status }
      }
    })
    .catch(() => null);

  return NextResponse.json({ user });
}
