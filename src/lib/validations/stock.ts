import { z } from "zod";

export const stockMovementTypeSchema = z.enum([
  "ENTRADA_COMPRA",
  "SAIDA_PRODUCAO",
  "ENTRADA_PRODUCAO",
  "TRANSFERENCIA",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO",
  "RESERVA",
  "ESTORNO"
]);

export const stockMovementSchema = z.object({
  type: stockMovementTypeSchema,
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).default(0),
  originWarehouseId: z.string().optional(),
  targetWarehouseId: z.string().optional(),
  lotId: z.string().optional(),
  productionOrderId: z.string().optional(),
  userId: z.string().min(1).optional(),
  document: z.string().max(80).optional(),
  justification: z.string().max(240).optional()
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
