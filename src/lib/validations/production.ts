import { z } from "zod";

const optionalNumberSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(2).max(40).optional()
);

export const productionOrderSchema = z.object({
  number: optionalNumberSchema,
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

export const productionDailyLogSchema = z.object({
  logDate: z.coerce.date(),
  teamPresent: z.string().min(3).max(1000),
  weatherMorning: z.string().min(2).max(80),
  weatherAfternoon: z.string().min(2).max(80),
  observation: z.string().max(1000).optional(),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      note: z.string().max(300).optional()
    })
  ).min(1)
});

export const productionBatchReleaseSchema = z.object({
  releasedQuantity: z.coerce.number().positive(),
  releaseResponsible: z.string().min(2).max(120),
  releaseNote: z.string().max(500).optional()
});

export type ProductionOrderInput = z.infer<typeof productionOrderSchema>;
export type ProductionNoteInput = z.infer<typeof productionNoteSchema>;
export type ProductionDailyLogInput = z.infer<typeof productionDailyLogSchema>;
export type ProductionBatchReleaseInput = z.infer<typeof productionBatchReleaseSchema>;
