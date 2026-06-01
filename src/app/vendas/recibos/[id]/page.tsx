import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, FileClock, PackageCheck, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { canViewOperationAudit, requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatMoney, formatQuantityWithUnit } from "@/lib/formatters";
import { parseSaleLines } from "@/lib/sales/parse-sale-lines";
import { SaleReceiptDocument } from "../../_components/sale-receipt-document";
import { PrintReceiptButton } from "../../../estoque/venda-direta/recibos/print-receipt-button";

export const dynamic = "force-dynamic";

function describeAuditAction(action: string) {
  const labels: Record<string, string> = {
    CREATE: "Criacao",
    UPDATE: "Atualizacao",
    CANCEL: "Cancelamento",
    STOCK_MOVE: "Movimento de estoque",
    STOCK_REVERSAL: "Estorno de estoque"
  };

  return labels[action] || action;
}

function compactJson(value: unknown) {
  if (!value) return "";

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export default async function ReciboVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession({ nextPath: "/vendas", permission: "estoque.view" });

  const { id } = await params;
  const prisma = getPrisma();
  const sale = await prisma.directSale.findUnique({
    where: { id },
    include: {
      item: { include: { unit: true } },
      warehouse: true,
      createdBy: true,
      cancelledBy: true,
      accountsReceivable: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!sale) {
    notFound();
  }

  const receivable = sale.accountsReceivable[0];
  const canViewAudit = canViewOperationAudit(session);
  const [stockMovements, directAudits] = canViewAudit
    ? await Promise.all([
        prisma.stockMovement.findMany({
          where: {
            OR: [
              { document: sale.number },
              { document: `${sale.number}-EST` },
              ...(sale.stockMovementId ? [{ id: sale.stockMovementId }] : [])
            ]
          },
          include: {
            item: { include: { unit: true } },
            originWarehouse: true,
            targetWarehouse: true,
            user: true
          },
          orderBy: { createdAt: "asc" }
        }),
        prisma.auditLog.findMany({
          where: {
            OR: [
              { entity: "DirectSale", entityId: sale.id },
              ...(receivable ? [{ entity: "AccountReceivable", entityId: receivable.id }] : [])
            ]
          },
          include: { user: true },
          orderBy: { createdAt: "asc" }
        })
      ])
    : [[], []];
  const movementAudits = canViewAudit && stockMovements.length > 0
    ? await prisma.auditLog.findMany({
        where: {
          entity: "StockMovement",
          entityId: { in: stockMovements.map((movement) => movement.id) }
        },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const auditEvents = [...directAudits, ...movementAudits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const saleLines = parseSaleLines(sale.consumedLots);
  const receiptItems =
    saleLines.length > 0
      ? saleLines
      : [
          {
            itemCode: sale.item.code,
            description: sale.item.description,
            unitCode: sale.item.unit.code,
            quantity: sale.quantity.toString(),
            unitPrice: sale.unitPrice.toString(),
            grossTotal: sale.grossTotal.toString()
          }
        ];

  return (
    <>
      <section className="page-head no-print">
        <div>
          <p className="eyebrow">Vendas / Recibo</p>
          <h1>{sale.number}</h1>
          <p className="lead">Recibo profissional para impressao ou salvamento em PDF.</p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/vendas">
            <ArrowLeft size={16} />
            Voltar
          </Link>
          <PrintReceiptButton />
        </div>
      </section>

      <section className="sale-receipt-page">
        <SaleReceiptDocument
          receiptNumber={sale.number}
          issuedAtLabel={sale.issuedAt.toLocaleString("pt-BR")}
          status={sale.status}
          customerName={sale.customerName}
          customerDocument={sale.customerDocument}
          sellerName={sale.createdBy.name}
          paymentMethod={sale.paymentMethod}
          items={receiptItems}
          discount={sale.discount.toString()}
          finalTotal={sale.finalTotal.toString()}
          note={sale.note}
          cancelReason={sale.cancelReason}
          financialTitle={receivable ? {
            number: receivable.number,
            status: receivable.status,
            receivedAmount: receivable.receivedAmount.toString()
          } : null}
        />
      </section>

      {canViewAudit ? (
      <section className="operation-audit-panel no-print">
        <div className="table-header">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2>Historico da operacao</h2>
            <small className="product-detail">Rastreabilidade da venda, financeiro, estoque e cancelamentos.</small>
          </div>
          <span className="badge blue">
            <FileClock size={14} />
            {auditEvents.length + stockMovements.length} evento(s)
          </span>
        </div>

        <section className="audit-summary-grid">
          <article>
            <ReceiptText size={18} />
            <span>Recibo</span>
            <strong>{sale.status}</strong>
            <small>Criado por {sale.createdBy.name} em {sale.issuedAt.toLocaleString("pt-BR")}</small>
          </article>
          <article>
            <WalletCards size={18} />
            <span>Financeiro</span>
            <strong>{receivable?.status || "Sem titulo"}</strong>
            <small>{receivable ? `${receivable.number} - recebido ${formatMoney(receivable.receivedAmount)}` : "Nenhum titulo vinculado"}</small>
          </article>
          <article>
            <PackageCheck size={18} />
            <span>Estoque</span>
            <strong>{stockMovements.length} movimento(s)</strong>
            <small>Saidas e estornos vinculados ao recibo</small>
          </article>
          <article>
            <ShieldCheck size={18} />
            <span>Responsavel</span>
            <strong>{sale.cancelledBy?.name || sale.createdBy.name}</strong>
            <small>{sale.cancelledAt ? `Cancelado em ${sale.cancelledAt.toLocaleString("pt-BR")}` : "Venda ativa"}</small>
          </article>
        </section>

        <div className="operation-timeline">
          <article className="timeline-item">
            <div className="timeline-marker"><ReceiptText size={15} /></div>
            <div>
              <span>{sale.issuedAt.toLocaleString("pt-BR")}</span>
              <strong>Venda criada</strong>
              <p>{sale.createdBy.name} criou o recibo {sale.number} para {sale.customerName}, total de {formatMoney(sale.finalTotal)}.</p>
            </div>
          </article>

          {receivable ? (
            <article className="timeline-item">
              <div className="timeline-marker"><WalletCards size={15} /></div>
              <div>
                <span>{receivable.createdAt.toLocaleString("pt-BR")}</span>
                <strong>Titulo financeiro gerado</strong>
                <p>{receivable.number} ficou com status {receivable.status} e valor recebido de {formatMoney(receivable.receivedAmount)}.</p>
              </div>
            </article>
          ) : null}

          {stockMovements.map((movement) => (
            <article className="timeline-item" key={movement.id}>
              <div className="timeline-marker"><PackageCheck size={15} /></div>
              <div>
                <span>{movement.createdAt.toLocaleString("pt-BR")}</span>
                <strong>{movement.type === "ESTORNO" ? "Estorno de estoque" : "Movimento de estoque"}</strong>
                <p>
                  {movement.user.name} registrou {formatQuantityWithUnit(movement.quantity, movement.item.unit.code)} de {movement.item.code}
                  {movement.originWarehouse ? ` saindo de ${movement.originWarehouse.code}` : ""}
                  {movement.targetWarehouse ? ` entrando em ${movement.targetWarehouse.code}` : ""}.
                </p>
                {movement.justification ? <small>{movement.justification}</small> : null}
              </div>
            </article>
          ))}

          {sale.cancelledAt ? (
            <article className="timeline-item danger">
              <div className="timeline-marker"><Clock3 size={15} /></div>
              <div>
                <span>{sale.cancelledAt.toLocaleString("pt-BR")}</span>
                <strong>Cancelamento controlado</strong>
                <p>{sale.cancelledBy?.name || "Usuario"} cancelou a venda. Motivo: {sale.cancelReason || "Nao informado"}.</p>
              </div>
            </article>
          ) : null}
        </div>

        <section className="table-shell audit-log-table">
          <div className="table-header">
            <div>
              <p className="eyebrow">Logs</p>
              <h2>Registros tecnicos</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Usuario</th>
                  <th>Modulo</th>
                  <th>Acao</th>
                  <th>Entidade</th>
                  <th>Motivo / detalhe</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="mono">{event.createdAt.toLocaleString("pt-BR")}</td>
                    <td>{event.user?.name || "Sistema"}</td>
                    <td>{event.module}</td>
                    <td>{describeAuditAction(event.action)}</td>
                    <td className="mono">{event.entity}</td>
                    <td>
                      <strong>{event.justification || "Sem motivo informado"}</strong>
                      {compactJson(event.newValue) ? <small className="product-detail">{compactJson(event.newValue)}</small> : null}
                    </td>
                  </tr>
                ))}
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Nenhum log tecnico encontrado para esta operacao.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      ) : null}
    </>
  );
}
