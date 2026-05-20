import { z } from "zod";

export const itemTypeSchema = z.enum([
  "MATERIA_PRIMA",
  "INSUMO",
  "PRODUTO_ACABADO",
  "PECA_PRE_MOLDADA",
  "FORMA_MOLDE",
  "SERVICO"
]);

export const productSchema = z.object({
  code: z.string().min(2).max(40),
  description: z.string().min(3).max(180),
  type: itemTypeSchema,
  group: z.string().max(80).optional(),
  unitId: z.string().min(1),
  controlsStock: z.boolean().default(true),
  controlsLot: z.boolean().default(false),
  minimumStock: z.coerce.number().min(0).default(0),
  standardCost: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true)
});

export type ProductInput = z.infer<typeof productSchema>;
