import { FileText } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { getPrisma } from "@/lib/db/prisma";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { SuprimentosNav } from "../_components/suprimentos-nav";
import { decimalToNumber, formatCurrency, orderStatusLabels, requireSuprimentosSession } from "../_lib";
import { PurchaseOrderActions } from "../purchase-order-actions";

export const dynamic = "force-dynamic";

type PedidosPageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function PedidosPage({ searchParams }: PedidosPageProps) {
  await requireSuprimentosSession("/suprimentos/pedidos");
  const params = (await searchParams) || {};
  const pagination = parsePagination(params, {
    pageParam: "pedidosPage",
    defaultPageSize: 12,
    maxPageSize: 60
  });
  const prisma = getPrisma();
  const [orders, ordersCount, issuedOrders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        purchaseQuote: true,
        purchaseRequest: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            },
            receipts: true
          },
        },
        createdBy: true
      },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize
    }),
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.count({
      where: {
        status: {
          in: ["EMITIDO", "ENVIADO"]
        }
      }
    })
  ]);
  const paginationMeta = getPaginationMeta(ordersCount, pagination.page, pagination.pageSize);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h1>Pedidos de compra</h1>
          <p className="lead">Acompanhe pedidos gerados a partir de cotacoes aprovadas.</p>
        </div>
        <span className="status-pill">
          <FileText size={16} />
          {issuedOrders} emitidos
        </span>
      </section>

      <SuprimentosNav />

      <section className="supply-record-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Pedidos de compra</p>
            <h2>Pedidos gerados por cotacao aprovada</h2>
          </div>
          <span className="badge blue">{ordersCount} registros</span>
        </div>
        <div className="supply-record-stack">
          {orders.map((order) => {
            const locked = order.items.some((item) => item.receipts.length > 0);
            const receivedItems = order.items.filter((item) => item.receipts.length > 0).length;

            return (
              <article className="supply-record-card" key={order.id}>
                <div className="supply-record-main">
                  <div className="supply-record-title">
                    <div>
                      <p className="eyebrow">Pedido</p>
                      <h3 className="mono">{order.number}</h3>
                      <span className="metric-sub">Cotacao {order.purchaseQuote.number} | {order.supplier.name}</span>
                    </div>
                    <span className="badge green">{orderStatusLabels[order.status] || order.status}</span>
                  </div>

                  <div className="quote-meta-grid">
                    <div>
                      <span>Total</span>
                      <strong>{formatCurrency(order.totalValue)}</strong>
                    </div>
                    <div>
                      <span>Entrega</span>
                      <strong>{order.expectedDeliveryAt ? order.expectedDeliveryAt.toLocaleDateString("pt-BR") : "-"}</strong>
                    </div>
                    <div>
                      <span>Recebimento</span>
                      <strong>{receivedItems}/{order.items.length} itens</strong>
                    </div>
                  </div>

                  <div className="supply-item-list-card">
                    {order.items.length > 0 ? order.items.map((orderItem) => (
                      <span className="daily-item-pill" key={orderItem.id}>
                        {orderItem.item.code}: {decimalToNumber(orderItem.quantity).toLocaleString("pt-BR")} {orderItem.item.unit.code}
                      </span>
                    )) : <span className="metric-sub">Sem item</span>}
                  </div>
                </div>

                <aside className="supply-record-actions">
                  <div className="quote-total-box">
                    <span>Total do pedido</span>
                    <strong>{formatCurrency(order.totalValue)}</strong>
                    <small>{order.createdBy.name}</small>
                  </div>
                  <PurchaseOrderActions
                    orderId={order.id}
                    locked={locked}
                    editData={{
                      number: order.number,
                      status: order.status,
                      expectedDeliveryAt: order.expectedDeliveryAt ? order.expectedDeliveryAt.toISOString().slice(0, 10) : "",
                      paymentTerms: order.paymentTerms || "",
                      freightCost: decimalToNumber(order.freightCost),
                      note: order.note || "",
                      items: order.items.map((item) => ({
                        id: item.id,
                        label: `${item.item.code} - ${item.item.description}`,
                        quantity: decimalToNumber(item.quantity),
                        unitCode: item.item.unit.code,
                        unitPrice: decimalToNumber(item.unitPrice),
                        note: item.note || ""
                      }))
                    }}
                  />
                </aside>
              </article>
            );
          })}
          {orders.length === 0 ? (
            <article className="card accent-gray">
              <p className="eyebrow">Pedidos</p>
              <h2>Nenhum pedido de compra gerado ainda.</h2>
            </article>
          ) : null}
        </div>
        <PaginationControls
          pathname="/suprimentos/pedidos"
          params={params}
          meta={paginationMeta}
          pageParam="pedidosPage"
        />
      </section>
    </>
  );
}
