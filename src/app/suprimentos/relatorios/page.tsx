import { ArrowDownUp, FileBarChart, FileSearch, ReceiptText, ShoppingCart } from "lucide-react";
import { getPrisma } from "@/lib/db/prisma";
import { SuprimentosNav } from "../_components/suprimentos-nav";
import { decimalToNumber, formatCurrency, requireSuprimentosSession } from "../_lib";
import { SupplyExternalReport } from "./supply-external-report";

export const dynamic = "force-dynamic";

const movementLabels: Record<string, string> = {
  ENTRADA_COMPRA: "Entrada por compra",
  SAIDA_PRODUCAO: "Saida producao",
  ENTRADA_PRODUCAO: "Entrada producao",
  TRANSFERENCIA: "Transferencia",
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
  RESERVA: "Reserva",
  ESTORNO: "Estorno"
};

function formatQuantity(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });
}

export default async function RelatoriosSuprimentosPage() {
  const session = await requireSuprimentosSession("/suprimentos/relatorios");
  const prisma = getPrisma();
  const [requests, quotes, orders, receipts, stockMovements] = await Promise.all([
    prisma.purchaseRequest.findMany({
      include: {
        requester: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.purchaseQuote.findMany({
      include: {
        supplier: true,
        createdBy: true,
        purchaseRequest: true,
        purchaseOrder: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        purchaseQuote: true,
        purchaseRequest: true,
        createdBy: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.purchaseReceipt.findMany({
      include: {
        receivedBy: true,
        warehouse: true,
        lot: true,
        purchaseOrder: {
          include: {
            supplier: true
          }
        },
        purchaseOrderItem: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.stockMovement.findMany({
      where: { type: "ENTRADA_COMPRA" },
      include: {
        item: {
          include: { unit: true }
        },
        targetWarehouse: true,
        originWarehouse: true,
        lot: true,
        user: true,
        purchaseReceipt: {
          include: {
            purchaseOrder: {
              include: {
                supplier: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    })
  ]);
  const approvedQuotesValue = quotes
    .filter((quote) => quote.status === "APROVADA")
    .reduce((sum, quote) => sum + Number(quote.totalValue), 0);
  const issuedOrdersValue = orders
    .filter((order) => order.status !== "CANCELADO")
    .reduce((sum, order) => sum + Number(order.totalValue), 0);
  const purchaseStockValue = stockMovements.reduce((sum, movement) => sum + decimalToNumber(movement.totalCost), 0);
  const timeline = [
    ...requests.map((request) => ({
      id: `request-${request.id}`,
      date: request.createdAt,
      stage: "Solicitacao",
      document: request.number,
      description: `${request.items.length} item(ns) solicitados`,
      status: request.status,
      responsible: request.requester.name,
      value: "-"
    })),
    ...quotes.map((quote) => ({
      id: `quote-${quote.id}`,
      date: quote.createdAt,
      stage: "Cotacao",
      document: quote.number,
      description: quote.supplier.name,
      status: quote.status,
      responsible: quote.createdBy.name,
      value: formatCurrency(quote.totalValue)
    })),
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      date: order.createdAt,
      stage: "Pedido",
      document: order.number,
      description: `${order.supplier.name} - ${order.items.length} item(ns)`,
      status: order.status,
      responsible: order.createdBy.name,
      value: formatCurrency(order.totalValue)
    })),
    ...receipts.map((receipt) => ({
      id: `receipt-${receipt.id}`,
      date: receipt.createdAt,
      stage: "Nota/Recebimento",
      document: receipt.number,
      description: `${receipt.purchaseOrderItem.item.code} - ${receipt.purchaseOrderItem.item.description}`,
      status: receipt.status,
      responsible: receipt.receivedBy.name,
      value: formatCurrency(receipt.totalCost)
    })),
    ...stockMovements.map((movement) => ({
      id: `stock-${movement.id}`,
      date: movement.createdAt,
      stage: "Estoque",
      document: movement.document || movement.purchaseReceipt?.number || "-",
      description: `${movement.item.code} - ${movement.item.description}`,
      status: movement.type,
      responsible: movement.user.name,
      value: formatCurrency(movement.totalCost)
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 80);
  const requestOptions = requests.map((request) => ({ id: request.id, number: request.number }));
  const supplierMap = new Map<string, string>();
  quotes.forEach((quote) => supplierMap.set(quote.supplierId, quote.supplier.name));
  orders.forEach((order) => supplierMap.set(order.supplierId, order.supplier.name));
  receipts.forEach((receipt) => supplierMap.set(receipt.purchaseOrder.supplierId, receipt.purchaseOrder.supplier.name));
  const supplierOptions = Array.from(supplierMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const orderOptions = orders.map((order) => ({ id: order.id, number: order.number }));
  const statusOptions = Array.from(new Set([
    ...requests.map((request) => request.status),
    ...quotes.map((quote) => quote.status),
    ...orders.map((order) => order.status),
    ...receipts.map((receipt) => receipt.status)
  ])).sort();
  const reportData = {
    generatedBy: session.name,
    generatedAt: new Date().toISOString(),
    requests: requests.map((request) => ({
      id: request.id,
      number: request.number,
      createdAt: request.createdAt.toISOString(),
      requester: request.requester.name,
      status: request.status,
      priority: request.priority,
      department: request.department || "",
      costCenter: request.costCenter || "",
      neededAt: request.neededAt?.toISOString() || "",
      justification: request.justification || "",
      items: request.items.map((requestItem) => ({
        id: requestItem.id,
        code: requestItem.item.code,
        description: requestItem.item.description,
        quantity: formatQuantity(requestItem.quantity),
        unit: requestItem.item.unit.code,
        note: requestItem.note || ""
      }))
    })),
    quotes: quotes.map((quote) => ({
      id: quote.id,
      number: quote.number,
      requestId: quote.purchaseRequestId,
      requestNumber: quote.purchaseRequest.number,
      supplierId: quote.supplierId,
      supplier: quote.supplier.name,
      createdAt: quote.createdAt.toISOString(),
      status: quote.status,
      deliveryDays: quote.deliveryDays === null ? "" : String(quote.deliveryDays),
      paymentTerms: quote.paymentTerms || "",
      freightCost: formatCurrency(quote.freightCost),
      totalValue: formatCurrency(quote.totalValue),
      note: quote.note || "",
      hasOrder: Boolean(quote.purchaseOrder),
      items: quote.items.map((quoteItem) => ({
        id: quoteItem.id,
        code: quoteItem.item.code,
        description: quoteItem.item.description,
        quantity: formatQuantity(quoteItem.quantity),
        unit: quoteItem.item.unit.code,
        unitPrice: formatCurrency(quoteItem.unitPrice),
        total: formatCurrency(quoteItem.totalValue),
        note: quoteItem.note || ""
      }))
    })),
    orders: orders.map((order) => ({
      id: order.id,
      number: order.number,
      quoteNumber: order.purchaseQuote.number,
      requestId: order.purchaseRequestId,
      requestNumber: order.purchaseRequest.number,
      supplierId: order.supplierId,
      supplier: order.supplier.name,
      createdAt: order.createdAt.toISOString(),
      issuedAt: order.issuedAt.toISOString(),
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() || "",
      responsible: order.createdBy.name,
      status: order.status,
      paymentTerms: order.paymentTerms || "",
      freightCost: formatCurrency(order.freightCost),
      totalValue: formatCurrency(order.totalValue),
      note: order.note || "",
      items: order.items.map((orderItem) => ({
        id: orderItem.id,
        code: orderItem.item.code,
        description: orderItem.item.description,
        quantity: formatQuantity(orderItem.quantity),
        unit: orderItem.item.unit.code,
        unitPrice: formatCurrency(orderItem.unitPrice),
        total: formatCurrency(orderItem.totalValue),
        note: orderItem.note || ""
      }))
    })),
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      invoiceNumber: receipt.invoiceNumber || "",
      orderNumber: receipt.purchaseOrder.number,
      supplierId: receipt.purchaseOrder.supplierId,
      supplier: receipt.purchaseOrder.supplier.name,
      item: `${receipt.purchaseOrderItem.item.code} - ${receipt.purchaseOrderItem.item.description}`,
      receivedAt: receipt.receivedAt.toISOString(),
      createdAt: receipt.createdAt.toISOString(),
      warehouse: receipt.warehouse.code,
      lot: receipt.lot?.code || "",
      receivedQuantity: formatQuantity(receipt.receivedQuantity),
      acceptedQuantity: formatQuantity(receipt.acceptedQuantity),
      unit: receipt.purchaseOrderItem.item.unit.code,
      status: receipt.status,
      responsible: receipt.receivedBy.name,
      totalCost: formatCurrency(receipt.totalCost),
      note: receipt.note || ""
    })),
    stockMovements: stockMovements.map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt.toISOString(),
      type: movementLabels[movement.type] || movement.type,
      item: `${movement.item.code} - ${movement.item.description}`,
      quantity: formatQuantity(movement.quantity),
      unit: movement.item.unit.code,
      warehouse: movement.targetWarehouse?.code || movement.originWarehouse?.code || "",
      lot: movement.lot?.code || "",
      document: movement.document || movement.purchaseReceipt?.invoiceNumber || movement.purchaseReceipt?.number || "",
      supplier: movement.purchaseReceipt?.purchaseOrder.supplier.name || "",
      totalCost: formatCurrency(movement.totalCost),
      responsible: movement.user.name
    })),
    timeline: timeline.map((event) => ({
      id: event.id,
      date: event.date.toISOString(),
      stage: event.stage,
      document: event.document,
      description: event.description,
      status: event.status,
      responsible: event.responsible,
      value: event.value
    }))
  };

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h1>Relatorios</h1>
          <p className="lead">Relatorios das movimentacoes de compras, pedidos, notas fiscais e entradas de materiais.</p>
        </div>
        <span className="status-pill">
          <FileBarChart size={16} />
          Movimentacoes
        </span>
      </section>

      <SuprimentosNav />

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Solicitacoes</span><ShoppingCart size={21} /></div>
          <strong className="metric-value">{requests.length}</strong>
          <span className="metric-sub">Ultimos registros do modulo</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Cotacoes aprovadas</span><FileSearch size={21} /></div>
          <strong className="metric-value">{formatCurrency(approvedQuotesValue)}</strong>
          <span className="metric-sub">Valor aprovado em cotacoes</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Pedidos</span><FileBarChart size={21} /></div>
          <strong className="metric-value">{formatCurrency(issuedOrdersValue)}</strong>
          <span className="metric-sub">Total de pedidos nao cancelados</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Notas/recebimentos</span><ReceiptText size={21} /></div>
          <strong className="metric-value">{receipts.length}</strong>
          <span className="metric-sub">Entradas conferidas</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-4">
          <div className="metric-top"><span className="mono">Entradas de compra</span><ArrowDownUp size={21} /></div>
          <strong className="metric-value">{stockMovements.length}</strong>
          <span className="metric-sub">Movimentacoes que alimentaram estoque</span>
        </article>
        <article className="metric-card accent-orange span-4">
          <div className="metric-top"><span className="mono">Valor movimentado</span><FileBarChart size={21} /></div>
          <strong className="metric-value">{formatCurrency(purchaseStockValue)}</strong>
          <span className="metric-sub">Custo total das entradas por compra</span>
        </article>
        <article className="metric-card accent-gray span-4">
          <div className="metric-top"><span className="mono">Linha do tempo</span><ReceiptText size={21} /></div>
          <strong className="metric-value">{timeline.length}</strong>
          <span className="metric-sub">Eventos recentes rastreados</span>
        </article>
      </section>

      <section style={{ marginBottom: 16 }}>
        <SupplyExternalReport
          {...reportData}
          supplierOptions={supplierOptions}
          requestOptions={requestOptions}
          orderOptions={orderOptions}
          statusOptions={statusOptions}
        />
      </section>

      <section className="table-shell" style={{ marginBottom: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Rastreabilidade</p>
            <h2>Linha do tempo das movimentacoes</h2>
          </div>
          <span className="badge blue">{timeline.length} eventos</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Etapa</th>
              <th>Documento</th>
              <th>Descricao</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Responsavel</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((event) => (
              <tr key={event.id}>
                <td className="mono">{event.date.toLocaleString("pt-BR")}</td>
                <td><span className="badge blue">{event.stage}</span></td>
                <td className="mono">{event.document}</td>
                <td>{event.description}</td>
                <td><span className="badge">{event.status}</span></td>
                <td className="mono">{event.value}</td>
                <td>{event.responsible}</td>
              </tr>
            ))}
            {timeline.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhuma movimentacao registrada ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell">
        <div className="table-header">
          <div>
            <p className="eyebrow">Materiais</p>
            <h2>Entradas no estoque por compra</h2>
          </div>
          <span className="badge green">{stockMovements.length} entradas</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Item</th>
              <th>Qtd.</th>
              <th>Deposito</th>
              <th>Lote</th>
              <th>Pedido/NF</th>
              <th>Fornecedor</th>
              <th>Custo total</th>
            </tr>
          </thead>
          <tbody>
            {stockMovements.map((movement) => (
              <tr key={movement.id}>
                <td className="mono">{movement.createdAt.toLocaleString("pt-BR")}</td>
                <td>{movementLabels[movement.type] || movement.type}</td>
                <td>{movement.item.code} - {movement.item.description}</td>
                <td className="mono">{formatQuantity(movement.quantity)} {movement.item.unit.code}</td>
                <td>{movement.targetWarehouse?.code || "-"}</td>
                <td>{movement.lot?.code || "-"}</td>
                <td className="mono">
                  {movement.purchaseReceipt?.purchaseOrder.number || movement.document || "-"}
                  {movement.purchaseReceipt?.invoiceNumber ? ` / NF ${movement.purchaseReceipt.invoiceNumber}` : ""}
                </td>
                <td>{movement.purchaseReceipt?.purchaseOrder.supplier.name || "-"}</td>
                <td className="mono">{formatCurrency(movement.totalCost)}</td>
              </tr>
            ))}
            {stockMovements.length === 0 ? (
              <tr>
                <td colSpan={9}>Nenhuma entrada por compra registrada ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
