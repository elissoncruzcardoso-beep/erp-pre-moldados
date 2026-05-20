import { z } from "zod";

export const productionOrderSchema = z.object({
  number: z.string().min(2).max(40),
  productId: z.string().min(1),
  compositionId: z.string().optional(),
  moldId: z.string().optional(),
  customerId: z.string().optional(),
  plannedQuantity: z.coerce.number().positive(),
  expectedDate: z.coerce.date().optional()
});

export const productionNoteSchema = z.object({
  productionOrderId: z.string().min(1),
  userId: z.string().min(1).optional(),
  stage: z.string().min(2).max(80),
  producedQuantity: z.coerce.number().min(0).default(0),
  lossQuantity: z.coerce.number().min(0).default(0),
  scrapQuantity: z.coerce.number().min(0).default(0),
  downtimeMinutes: z.coerce.number().int().min(0).default(0),
  note: z.string().max(500).optional(),
  finishStage: z.coerce.boolean().default(false)
});

export type ProductionOrderInput = z.infer<typeof productionOrderSchema>;
export type ProductionNoteInput = z.infer<typeof productionNoteSchema>;
