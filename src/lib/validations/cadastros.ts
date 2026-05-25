import { z } from "zod";

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .transform((value) => value.toUpperCase());

export const unitOfMeasureSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(80),
  decimals: z.coerce.number().int().min(0).max(6)
});

export const inputGroupSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(90),
  type: z.enum(["MATERIA_PRIMA", "INSUMO", "FORMA_MOLDE", "SERVICO"]).default("INSUMO"),
  defaultFinancialGroupId: z.string().optional(),
  controlsStock: z.coerce.boolean().default(true),
  active: z.coerce.boolean().default(true),
  note: z.string().trim().max(300).optional()
});

export const financialGroupSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(90),
  type: z.enum(["ENTRADA", "SAIDA"]),
  category: z.string().trim().max(80).optional(),
  costCenter: z.string().trim().max(80).optional(),
  active: z.coerce.boolean().default(true),
  note: z.string().trim().max(300).optional()
});

export type UnitOfMeasureInput = z.infer<typeof unitOfMeasureSchema>;
export type InputGroupInput = z.infer<typeof inputGroupSchema>;
export type FinancialGroupInput = z.infer<typeof financialGroupSchema>;
