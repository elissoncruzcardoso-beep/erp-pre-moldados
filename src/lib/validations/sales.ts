import { z } from "zod";

export const saleItemSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0)
});

export const stockSaleSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2).max(120),
  customerDocument: z.string().trim().max(40).optional(),
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  items: z.array(saleItemSchema).optional(),
  paymentMethod: z.string().trim().max(60).optional(),
  settleNow: z.coerce.boolean().default(false),
  note: z.string().trim().max(240).optional()
});

export type SaleItemInput = z.infer<typeof saleItemSchema>;
export type StockSaleInput = z.infer<typeof stockSaleSchema>;

