import { z } from "zod";

const optionalCodeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(2).max(40).optional()
);

export const itemTypeSchema = z.enum([
  "MATERIA_PRIMA",
  "INSUMO",
  "PRODUTO_ACABADO",
  "PECA_PRE_MOLDADA",
  "FORMA_MOLDE",
  "SERVICO"
]);

export const productSchema = z.object({
  code: optionalCodeSchema,
  description: z.string().min(3).max(180),
  type: itemTypeSchema,
  group: z.string().max(80).optional(),
  unitId: z.string().min(1),
  controlsStock: z.boolean().default(true),
  controlsLot: z.boolean().default(false),
  minimumStock: z.coerce.number().min(0).default(0),
  standardCost: z.coerce.number().min(0).default(0),
  curingHours: z.coerce.number().int().min(0).max(720).default(24),
  active: z.boolean().default(true)
});

export type ProductInput = z.infer<typeof productSchema>;

export const compositionSchema = z.object({
  code: optionalCodeSchema,
  productId: z.string().min(1),
  version: z.string().min(1).max(20).default("1"),
  revision: z.string().min(1).max(20).default("A"),
  baseQuantity: z.coerce.number().positive().default(1),
  expectedLoss: z.coerce.number().min(0).max(100).default(0),
  curingHours: z.coerce.number().int().min(0).max(720).optional(),
  approved: z.boolean().default(false),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      lossPercent: z.coerce.number().min(0).max(100).default(0),
      stage: z.string().max(80).optional()
    })
  ).min(1)
});

export type CompositionInput = z.infer<typeof compositionSchema>;
