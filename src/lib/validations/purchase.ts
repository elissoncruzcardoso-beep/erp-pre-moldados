import { z } from "zod";

const optionalNumberSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(2).max(40).optional()
);

export const purchaseRequestSchema = z.object({
  number: optionalNumberSchema,
  department: z.string().max(80).optional(),
  costCenter: z.string().max(80).optional(),
  priority: z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]).default("NORMAL"),
  neededAt: z.coerce.date().optional(),
  justification: z.string().max(500).optional(),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      note: z.string().max(240).optional()
    })
  ).min(1)
});

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export const purchaseQuoteSchema = z.object({
  number: optionalNumberSchema,
  purchaseRequestId: z.string().min(1),
  supplierId: z.string().min(1),
  deliveryDays: z.coerce.number().int().min(0).max(3650).optional(),
  paymentTerms: z.string().max(120).optional(),
  validUntil: z.coerce.date().optional(),
  freightCost: z.coerce.number().min(0).max(999999999).default(0),
  note: z.string().max(500).optional(),
  items: z.array(
    z.object({
      purchaseRequestItemId: z.string().min(1),
      itemId: z.string().min(1),
      supplierId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      unitPrice: z.coerce.number().min(0).max(999999999),
      discountValue: z.coerce.number().min(0).max(999999999).default(0),
      freightCost: z.coerce.number().min(0).max(999999999).default(0),
      note: z.string().max(240).optional()
    })
  ).min(1)
}).superRefine((input, context) => {
  input.items.forEach((item, index) => {
    const grossValue = item.quantity * item.unitPrice;

    if (item.discountValue > grossValue + item.freightCost) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Desconto maior que o valor do item.",
        path: ["items", index, "discountValue"]
      });
    }
  });
});

export type PurchaseQuoteInput = z.infer<typeof purchaseQuoteSchema>;

export const purchaseOrderUpdateSchema = z.object({
  status: z.enum(["EMITIDO", "ENVIADO", "PARCIALMENTE_RECEBIDO", "RECEBIDO", "CANCELADO"]),
  expectedDeliveryAt: z.coerce.date().optional(),
  paymentTerms: z.string().max(120).optional(),
  freightCost: z.coerce.number().min(0).max(999999999).default(0),
  note: z.string().max(500).optional(),
  items: z.array(
    z.object({
      id: z.string().min(1),
      quantity: z.coerce.number().positive(),
      unitPrice: z.coerce.number().min(0).max(999999999),
      note: z.string().max(240).optional()
    })
  ).min(1)
});

export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

export const purchaseReceiptSchema = z.object({
  number: optionalNumberSchema,
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

export const purchaseReceiptBatchSchema = z.object({
  purchaseOrderId: z.string().min(1),
  warehouseId: z.string().min(1),
  invoiceNumber: z.string().min(1).max(80),
  receiptPrefix: z.string().max(32).optional(),
  supplierLot: z.string().max(80).optional(),
  receivedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
  items: z.array(
    z.object({
      purchaseOrderItemId: z.string().min(1),
      receivedQuantity: z.coerce.number().min(0),
      acceptedQuantity: z.coerce.number().min(0),
      unitCost: z.coerce.number().min(0).max(999999999),
      lotCode: z.string().max(80).optional(),
      manufacturedAt: z.coerce.date().optional(),
      expiresAt: z.coerce.date().optional(),
      note: z.string().max(240).optional()
    })
  ).min(1)
}).superRefine((input, context) => {
  let hasAcceptedItem = false;

  input.items.forEach((item, index) => {
    if (item.acceptedQuantity > item.receivedQuantity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quantidade aceita nao pode ser maior que a recebida.",
        path: ["items", index, "acceptedQuantity"]
      });
    }

    if (item.acceptedQuantity > 0) {
      hasAcceptedItem = true;
    }
  });

  if (!hasAcceptedItem) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe ao menos um item aceito para entrada no estoque.",
      path: ["items"]
    });
  }
});

export type PurchaseReceiptBatchInput = z.infer<typeof purchaseReceiptBatchSchema>;

export const purchaseReceiptUpdateSchema = z.object({
  number: z.string().min(2).max(40),
  invoiceNumber: z.string().max(80).optional(),
  supplierLot: z.string().max(80).optional(),
  receivedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional()
});

export type PurchaseReceiptUpdateInput = z.infer<typeof purchaseReceiptUpdateSchema>;

export const accountPayableSchema = z.object({
  purchaseReceiptId: z.string().min(1),
  number: optionalNumberSchema,
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
  number: optionalNumberSchema,
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
