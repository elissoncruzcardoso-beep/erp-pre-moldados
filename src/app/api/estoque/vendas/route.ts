import { apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import {
  calculateDirectSaleTotals,
  createDirectSale,
  directSaleReceiptPayload
} from "@/lib/sales/direct-sale-service";
import { stockSaleSchema } from "@/lib/validations/sales";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "estoque.move",
    forbiddenMessage: "Voce nao tem permissao para vender pelo estoque."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = stockSaleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os dados da venda.", parsed.error.flatten());
  }

  const input = parsed.data;
  const totals = calculateDirectSaleTotals(input);

  if (totals.finalTotal.lessThan(0)) {
    return apiError("O desconto nao pode ser maior que o total bruto.");
  }

  try {
    const sale = await createDirectSale(getPrisma(), input, { userId: session.userId });
    return apiSuccess({ receipt: directSaleReceiptPayload(sale) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel registrar a venda.", {
      context: {
        request,
        module: "Vendas",
        action: "registrar_venda_direta",
        userId: session.userId,
        entity: "DirectSale"
      },
      event: "direct_sale_error"
    });
  }
}
