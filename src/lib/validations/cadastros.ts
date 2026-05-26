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

export const customerSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(120),
  document: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(2).optional(),
  active: z.coerce.boolean().default(true)
});

export const paymentMethodSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(90),
  type: z.enum(["A_VISTA", "A_PRAZO", "CARTAO", "PIX", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"]).default("A_VISTA"),
  active: z.coerce.boolean().default(true),
  note: z.string().trim().max(300).optional()
});

export const financialSettlementTypeSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(90),
  direction: z.enum(["ENTRADA", "SAIDA", "ESTORNO"]).default("ENTRADA"),
  active: z.coerce.boolean().default(true),
  note: z.string().trim().max(300).optional()
});

export type UnitOfMeasureInput = z.infer<typeof unitOfMeasureSchema>;
export type InputGroupInput = z.infer<typeof inputGroupSchema>;
export type FinancialGroupInput = z.infer<typeof financialGroupSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
export type FinancialSettlementTypeInput = z.infer<typeof financialSettlementTypeSchema>;
