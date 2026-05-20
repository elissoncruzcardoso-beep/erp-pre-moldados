import { z } from "zod";

export const purchaseRequestSchema = z.object({
  number: z.string().min(2).max(40),
  department: z.string().max(80).optional(),
  costCenter: z.string().max(80).optional(),
  priority: z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]).default("NORMAL"),
  neededAt: z.coerce.date().optional(),
  justification: z.string().max(500).optional(),
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  note: z.string().max(240).optional()
});

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export const purchaseQuoteSchema = z.object({
  number: z.string().min(2).max(40),
  purchaseRequestId: z.string().min(1),
  supplierId: z.string().min(1),
  deliveryDays: z.coerce.number().int().min(0).max(3650).optional(),
  paymentTerms: z.string().max(120).optional(),
  validUntil: z.coerce.date().optional(),
  freightCost: z.coerce.number().min(0).max(999999999).default(0),
  totalValue: z.coerce.number().positive().max(999999999),
  note: z.string().max(500).optional()
});

export type PurchaseQuoteInput = z.infer<typeof purchaseQuoteSchema>;

export const purchaseReceiptSchema = z.object({
  number: z.string().min(2).max(40),
  purchaseOrderItemId: z.string().min(1),
  warehouseId: z.string().min(1),
  receivedQuantity: z.coerce.number().positive(),
  acceptedQuantity: z.coerce.number().positive(),
  invoiceNumber: z.string().max(80).optional(),
  lotCode: z.string().max(80).optional(),
  supplierLot: z.string().max(80).optional(),
  manufacturedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  receivedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional()
});

export type PurchaseReceiptInput = z.infer<typeof purchaseReceiptSchema>;

export const accountPayableSchema = z.object({
  purchaseReceiptId: z.string().min(1),
  number: z.string().min(2).max(40),
  dueDate: z.coerce.date(),
  costCenter: z.string().max(80).optional(),
  note: z.string().max(500).optional()
});

export type AccountPayableInput = z.infer<typeof accountPayableSchema>;

export const accountPaymentSchema = z.object({
  accountPayableId: z.string().min(1),
  paymentDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  method: z.string().min(2).max(60),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional()
});

export type AccountPaymentInput = z.infer<typeof accountPaymentSchema>;

export const accountReceivableSchema = z.object({
  number: z.string().min(2).max(40),
  customerId: z.string().min(1),
  description: z.string().min(3).max(160),
  documentNumber: z.string().max(80).optional(),
  costCenter: z.string().max(80).optional(),
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  note: z.string().max(500).optional()
});

export type AccountReceivableInput = z.infer<typeof accountReceivableSchema>;

export const accountReceiptSchema = z.object({
  accountReceivableId: z.string().min(1),
  receiptDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  method: z.string().min(2).max(60),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional()
});

export type AccountReceiptInput = z.infer<typeof accountReceiptSchema>;
