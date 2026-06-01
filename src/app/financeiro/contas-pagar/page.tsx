import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountPayableStatus, Prisma } from "@prisma/client";
import { ArrowDownCircle, ArrowLeft, Banknote, Filter, ShieldCheck } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { PrototypeAction } from "@/components/prototype-action";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatMoney } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { AccountPayableForm } from "../account-payable-form";
import { AccountPaymentForm } from "../account-payment-form";
import { FinanceModuleTabs } from "../_components/finance-module-tabs";

export const dynamic = "force-dynamic";

const payableStatusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  PROGRAMADO: "Programado",
  PAGO: "Pago",
  CANCELADO: "Cancelado"
};

function badgeForStatus(status: string) {
  if (status === "PAGO") return "badge green";
  if (status === "CANCELADO") return "badge red";
  if (status === "PROGRAMADO") return "badge blue";
  return "badge orange";
}

type PageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function ContasPagarPage({ searchParams }: PageProps) {
  const session = await getSession();

  if (!session) redirect("/login?next=/financeiro/contas-pagar");
  if (!session.permissions.includes("financeiro.view")) redirect("/dashboard");

  const params = (await searchParams) || {};
  const pagination = parsePagination(params, {
    pageParam: "pagarPage",
    defaultPageSize: 12,
    maxPageSize: 80
  });
  const prisma = getPrisma();
  const openPayablesWhere: Prisma.AccountPayableWhereInput = {
    status: { in: [AccountPayableStatus.ABERTO, AccountPayableStatus.PROGRAMADO] }
  };
  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);
  const [payables, payablesCount, payableStats, dueNext30Stats, payableOptionsSource, pendingReceipts, payments] = await Promise.all([
    prisma.accountPayable.findMany({
      include: {
        supplier: true,
        payments: true,
        purchaseReceipt: {
          include: {
            purchaseOrder: true,
            purchaseOrderItem: { include: { item: true } }
          }
        },
        createdBy: true
      },
      orderBy: { dueDate: "asc" },
      skip: pagination.skip,
      take: pagination.pageSize
    }),
    prisma.accountPayable.count(),
    prisma.accountPayable.aggregate({
      where: openPayablesWhere,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountPayable.aggregate({
      where: {
        ...openPayablesWhere,
        dueDate: { lte: next30 }
      },
      _sum: { amount: true }
    }),
    prisma.accountPayable.findMany({
      where: openPayablesWhere,
      include: { supplier: true, payments: true },
      orderBy: { dueDate: "asc" },
      take: 100
    }),
    prisma.purchaseReceipt.findMany({
      where: {
        accountPayable: null,
        status: { in: ["LIBERADO_ESTOQUE", "DIVERGENTE"] }
      },
      include: {
        purchaseOrder: { include: { supplier: true } },
        purchaseOrderItem: { include: { item: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.accountPayment.findMany({
      include: { accountPayable: { include: { supplier: true } }, paidBy: true },
      orderBy: { paymentDate: "desc" },
      take: 20
    })
  ]);

  const payableTotal = decimalToNumber(payableStats._sum.amount);
  const paidTotal = payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  const dueNext30 = decimalToNumber(dueNext30Stats._sum.amount);
  const payableOptions = payableOptionsSource.map((payable) => {
    const paid = payable.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
    return {
      id: payable.id,
      number: payable.number,
      supplier: payable.supplier.name,
      remainingAmount: Math.max(decimalToNumber(payable.amount) - paid, 0)
    };
  }).filter((payable) => payable.remainingAmount > 0);
  const paginationMeta = getPaginationMeta(payablesCount, pagination.page, pagination.pageSize);

  return (
    <>
      <section className="product-hero-panel finance-hero-panel">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1>Contas a pagar</h1>
          <p className="lead">Geracao de titulos a partir de recebimentos/NF, controle de vencimentos e baixa de pagamentos.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} />Acesso: {session.role}</span>
          <Link className="secondary-button" href="/financeiro"><ArrowLeft size={17} />Resumo</Link>
        </div>
      </section>

      <FinanceModuleTabs active="pagar" />

      <section className="product-metric-grid finance-metric-grid">
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Aberto</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatMoney(payableTotal)}</strong>
          <span className="metric-sub">{payableStats._count._all} titulo(s) em aberto</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Pago</span><ArrowDownCircle size={22} /></div>
          <strong className="metric-value">{formatMoney(paidTotal)}</strong>
          <span className="metric-sub">{payments.length} baixa(s) recentes</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Proximos 30 dias</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatMoney(dueNext30)}</strong>
          <span className="metric-sub">Vencimentos em curto prazo</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">NF sem titulo</span><ArrowDownCircle size={22} /></div>
          <strong className="metric-value">{pendingReceipts.length}</strong>
          <span className="metric-sub">Recebimentos pendentes</span>
        </article>
      </section>

      <section className="product-section-card finance-filter-panel">
        <div className="table-header product-card-header">
          <div><p className="eyebrow">Filtros</p><h2>Consulta de pagamentos</h2></div>
          <PrototypeAction className="secondary-button" message="Filtros reais serao conectados depois."><Filter size={17} />Filtrar</PrototypeAction>
        </div>
        <div className="report-filter-grid">
          <div className="field"><span>Status</span><div className="input-like">Abertos</div></div>
          <div className="field"><span>Fornecedor</span><div className="input-like">Todos</div></div>
          <div className="field"><span>Periodo</span><div className="input-like">Vencimento</div></div>
          <div className="field"><span>Origem</span><div className="input-like">Recebimento/NF</div></div>
        </div>
      </section>

      <section className="finance-action-grid two-columns">
        <section className="product-section-card finance-action-card">
          <p className="eyebrow">Novo titulo</p>
          <h2>Gerar conta a pagar</h2>
          <AccountPayableForm receipts={pendingReceipts.map((receipt) => ({
            id: receipt.id,
            number: receipt.number,
            supplier: receipt.purchaseOrder.supplier.name,
            document: receipt.invoiceNumber || receipt.number,
            amount: decimalToNumber(receipt.totalCost)
          }))} />
        </section>
        <section className="product-section-card finance-action-card">
          <p className="eyebrow">Baixa</p>
          <h2>Registrar pagamento</h2>
          <AccountPaymentForm payables={payableOptions} />
        </section>
      </section>

      <section className="finance-table-grid single">
        <div className="table-shell product-table-shell">
          <div className="table-header">
            <div><p className="eyebrow">Saidas</p><h2>Contas a pagar reais</h2></div>
            <span className="badge blue">{payablesCount} registros</span>
          </div>
          <div className="table-scroll">
            <table className="technical-items-table finance-data-table">
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Fornecedor / NF</th>
                  <th>Origem</th>
                  <th className="number-cell">Valor</th>
                  <th className="number-cell">Pago</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((payable) => (
                  <tr key={payable.id}>
                    <td className="mono">{payable.number}</td>
                    <td><strong>{payable.supplier.name}</strong><small className="product-detail">{payable.documentNumber || "-"}</small></td>
                    <td><span className="mono">{payable.purchaseReceipt.purchaseOrder.number}</span><small className="product-detail">{payable.purchaseReceipt.purchaseOrderItem.item.description}</small></td>
                    <td className="mono number-cell">{formatMoney(payable.amount)}</td>
                    <td className="mono number-cell">{formatMoney(payable.paidAmount)}</td>
                    <td>{payable.dueDate.toLocaleDateString("pt-BR")}</td>
                    <td><span className={badgeForStatus(payable.status)}>{payableStatusLabels[payable.status] || payable.status}</span></td>
                  </tr>
                ))}
                {payables.length === 0 ? <tr><td colSpan={7}>Nenhuma conta a pagar gerada ainda.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pathname="/financeiro/contas-pagar"
            params={params}
            meta={paginationMeta}
            pageParam="pagarPage"
          />
        </div>
      </section>
    </>
  );
}
