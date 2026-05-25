import { ReceiptText } from "lucide-react";
import { getPrisma } from "@/lib/db/prisma";
import { SuprimentosNav } from "../_components/suprimentos-nav";
import { decimalToNumber, formatCurrency, receiptStatusLabels, requireSuprimentosSession } from "../_lib";
import { PurchaseReceiptActions } from "../purchase-receipt-actions";
import { PurchaseReceiptForm } from "../purchase-receipt-form";

export const dynamic = "force-dynamic";

export default async function NotasFiscaisPage() {
  await requireSuprimentosSession("/suprimentos/notas-fiscais");
  const prisma = getPrisma();
  const [orders, warehouses, receipts] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        status: {
          notIn: ["CANCELADO", "RECEBIDO"]
        }
      },
      include: {
        supplier: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            },
            receipts: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 40
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.purchaseReceipt.findMany({
      include: {
        purchaseOrder: true,
        purchaseOrderItem: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        },
        warehouse: true,
        lot: true,
        stockMovement: true,
        accountPayable: true,
        receivedBy: true
      },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);
  const orderOptions = orders
    .map((order) => {
      const orderLineTotal = order.items.reduce((sum, item) => sum + decimalToNumber(item.totalValue), 0);
      const pendingItems = order.items.map((item) => {
        const accepted = item.receipts?.reduce((sum, receipt) => sum + decimalToNumber(receipt.acceptedQuantity), 0) ?? 0;
        const orderedQuantity = decimalToNumber(item.quantity);
        const pendingQuantity = Math.max(orderedQuantity - accepted, 0);
        const itemTotal = decimalToNumber(item.totalValue);
        const freightShare = orderLineTotal > 0
          ? decimalToNumber(order.freightCost) * (itemTotal / orderLineTotal)
          : 0;
        const approvedUnitCost = orderedQuantity > 0
          ? (itemTotal + freightShare) / orderedQuantity
          : decimalToNumber(item.unitPrice);

        return {
          id: item.id,
          item: `${item.item.code} - ${item.item.description}`,
          pendingQuantity,
          unitCode: item.item.unit.code,
          unitPrice: decimalToNumber(item.unitPrice),
          approvedUnitCost,
          approvedPendingTotal: approvedUnitCost * pendingQuantity
        };
      }).filter((item) => item.pendingQuantity > 0);

      return {
        id: order.id,
        number: order.number,
        supplierName: order.supplier.name,
        totalValue: decimalToNumber(order.totalValue),
        items: pendingItems
      };
    })
    .filter((order) => order.items.length > 0);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h1>Notas fiscais de compra</h1>
          <p className="lead">Registre a NF, confira quantidades, libere entrada no estoque e gere contas a pagar.</p>
        </div>
        <span className="status-pill">
          <ReceiptText size={16} />
          {receipts.length} recebimentos
        </span>
      </section>

      <SuprimentosNav />

      <section className="card accent-gray supply-form-card" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Recebimento e conferencia</p>
        <h2>Conferir entrega, liberar estoque e gerar financeiro</h2>
        <p className="metric-sub">Selecione o pedido, confira todos os insumos da NF e ajuste quantidade ou custo quando houver divergencia.</p>
        <PurchaseReceiptForm
          orders={orderOptions}
          warehouses={warehouses.map((warehouse) => ({
            id: warehouse.id,
            code: warehouse.code,
            name: warehouse.name
          }))}
        />
      </section>

      <section className="supply-record-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Notas fiscais de compra</p>
            <h2>Conferencias liberadas para estoque</h2>
          </div>
          <span className="badge blue">{receipts.length} registros</span>
        </div>
        <div className="supply-record-stack">
          {receipts.map((receipt) => {
            const locked = Boolean(receipt.accountPayable);

            return (
              <article className="supply-record-card" key={receipt.id}>
                <div className="supply-record-main">
                  <div className="supply-record-title">
                    <div>
                      <p className="eyebrow">Nota fiscal</p>
                      <h3 className="mono">{receipt.invoiceNumber || receipt.number}</h3>
                      <span className="metric-sub">Pedido {receipt.purchaseOrder.number} | Codigo interno {receipt.number}</span>
                    </div>
                    <span className={receipt.status === "DIVERGENTE" ? "badge orange" : "badge green"}>
                      {receiptStatusLabels[receipt.status] || receipt.status}
                    </span>
                  </div>

                  <div className="quote-meta-grid">
                    <div>
                      <span>Recebido</span>
                      <strong>{decimalToNumber(receipt.receivedQuantity).toLocaleString("pt-BR")} {receipt.purchaseOrderItem.item.unit.code}</strong>
                    </div>
                    <div>
                      <span>Aceito</span>
                      <strong>{decimalToNumber(receipt.acceptedQuantity).toLocaleString("pt-BR")} {receipt.purchaseOrderItem.item.unit.code}</strong>
                    </div>
                    <div>
                      <span>Deposito</span>
                      <strong>{receipt.warehouse.code}</strong>
                    </div>
                  </div>

                  <div className="supply-item-list-card">
                    <span className="daily-item-pill">
                      {receipt.purchaseOrderItem.item.code} - {receipt.purchaseOrderItem.item.description}
                    </span>
                    <span className="daily-item-pill">
                      Lote {receipt.lot?.code || "-"}
                    </span>
                    <span className="daily-item-pill">
                      {receipt.stockMovement ? "ENTRADA_COMPRA" : "Sem movimento"}
                    </span>
                  </div>
                </div>

                <aside className="supply-record-actions">
                  <div className="quote-total-box">
                    <span>Valor recebido</span>
                    <strong>{formatCurrency(receipt.totalCost)}</strong>
                    <small>{receipt.accountPayable ? "Titulo financeiro gerado" : "Sem titulo financeiro"}</small>
                  </div>
                  <PurchaseReceiptActions
                    receiptId={receipt.id}
                    locked={locked}
                    editData={{
                      number: receipt.number,
                      invoiceNumber: receipt.invoiceNumber || "",
                      supplierLot: receipt.supplierLot || "",
                      receivedAt: receipt.receivedAt.toISOString().slice(0, 10),
                      note: receipt.note || ""
                    }}
                  />
                </aside>
              </article>
            );
          })}
          {receipts.length === 0 ? (
            <article className="card accent-gray">
              <p className="eyebrow">Notas fiscais</p>
              <h2>Nenhum recebimento registrado ainda.</h2>
            </article>
          ) : null}
        </div>
      </section>
    </>
  );
}
