import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeItemCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { productSchema } from "@/lib/validations/product";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "produtos.manage",
    forbiddenMessage: "Voce nao tem permissao para cadastrar produtos."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos obrigatorios do produto.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;
  const usesCuring = input.type === "PECA_PRE_MOLDADA" || input.type === "PRODUTO_ACABADO";

  try {
    const item = await prisma.item.create({
      data: {
        code: normalizeManualCode(input.code) || makeItemCode(input.type),
        description: input.description.trim(),
        type: input.type,
        group: input.group?.trim() || null,
        unitId: input.unitId,
        controlsStock: input.controlsStock,
        controlsLot: input.controlsLot,
        minimumStock: new Prisma.Decimal(input.minimumStock),
        standardCost: new Prisma.Decimal(input.standardCost),
        curingHours: usesCuring ? input.curingHours : 0,
        active: input.active
      },
      include: {
        unit: true
      }
    });

    await prisma.auditLog
      .create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.CREATE,
          entity: "Item",
          entityId: item.id,
          newValue: {
            code: item.code,
            description: item.description,
            type: item.type,
            curingHours: item.curingHours
          }
        }
      })
      .catch(() => null);

    return apiSuccess({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um produto com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel cadastrar o produto.", {
      context: {
        request,
        module: "Produtos",
        action: "cadastrar_produto",
        userId: auth.session.userId,
        entity: "Item"
      },
      event: "product_create_error"
    });
  }
}
