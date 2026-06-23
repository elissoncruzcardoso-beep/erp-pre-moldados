import Link from "next/link";
import { AccountPayableStatus, Prisma } from "@prisma/client";
import { ArrowDownCircle, ArrowLeft, Banknote, Filter, ShieldCheck } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatMoney } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { FORM_OPTION_LIMIT } from "@/lib/query-limits";
import { AccountPayableForm } from "../account-payable-form";
import { AccountPaymentForm } from "../account-payment-form";
import { AccountPayableActions } from "../account-payable-actions";
import { FinanceModuleTabs } from "../_components/finance-module-tabs";

export const dynamic = "force-dynamic";

const payableStatusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  PROGRAMADO: "Programado",
  PAGO: "Pago",
  CANCELADO: "Cancelado"
};

const filterStatusLabels: Record<string, string> = {
  ABERTOS: "Abertos e programados",
  ABERTO: "Somente abertos",
  PROGRAMADO: "Somente programados",
  PAGO: "Pagos",
  CANCELADO: "Cancelados",
  TODOS: "Todos"
};

function badgeForStatus(status: string) {
  if (status === "PAGO") return "badge green";
  if (status === "CANCELADO") return "badge red";
  if (status === "PROGRAMADO") return "badge blue";
  return "badge orange";
}

function parseFilterDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(value?: string) {
  const date = parseFilterDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function firstParam(params: SearchParamsLike, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

type PageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function ContasPagarPage({ searchParams }: PageProps) {
  const session = await requirePageSession({ nextPath: "/financeiro/contas-pagar", permission: "financeiro.view" });
  const canForceDeletePayables = ["Administrador", "Diretoria"].includes(session.role);

  const params = (await searchParams) || {};
  const statusFilter = firstParam(params, "status") || "ABERTOS";
  const supplierFilter = firstParam(params, "supplierId");
  const startDate = firstParam(params, "startDate");
  const endDate = firstParam(params, "endDate");
  const originFilter = firstParam(params, "origin") || "TODAS";
  const search = firstParam(params, "q").trim();
  const pagination = parsePagination(params, {
    pageParam: "pagarPage",
    defaultPageSize: 12,
    maxPageSize: 80
  });
  const prisma = getPrisma();
  const where: Prisma.AccountPayableWhereInput = {};
  const andFilters: Prisma.AccountPayableWhereInput[] = [];

  if (statusFilter === "ABERTOS") {
    andFilters.push({ status: { in: [AccountPayableStatus.ABERTO, AccountPayableStatus.PROGRAMADO] } });
  } else if (statusFilter !== "TODOS") {
    andFilters.push({ status: statusFilter as AccountPayableStatus });
  }

  if (supplierFilter) {
    andFilters.push({ supplierId: supplierFilter });
  }

  const dueFrom = parseFilterDate(startDate);
  const dueTo = endOfDay(endDate);
  if (dueFrom || dueTo) {
    andFilters.push({
      dueDate: {
        ...(dueFrom ? { gte: dueFrom } : {}),
        ...(dueTo ? { lte: dueTo } : {})
      }
    });
  }

  if (originFilter === "NF") {
    andFilters.push({ purchaseReceiptId: { not: "" } });
  } else if (originFilter === "MANUAL") {
    andFilters.push({ purchaseReceiptId: "" });
  }

  if (search) {
    andFilters.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { documentNumber: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { purchaseReceipt: { is: { number: { contains: search, mode: "insensitive" } } } },
        { purchaseReceipt: { is: { invoiceNumber: { contains: search, mode: "insensitive" } } } },
        { purchaseReceipt: { is: { purchaseOrder: { is: { number: { contains: search, mode: "insensitive" } } } } } }
      ]
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  const openPayablesWhere: Prisma.AccountPayableWhereInput = {
    status: { in: [AccountPayableStatus.ABERTO, AccountPayableStatus.PROGRAMADO] }
  };
  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);
  const [payables, payablesCount, payableStats, dueNext30Stats, payableOptionsSource, pendingReceipts, payments, suppliers] = await Promise.all([
    prisma.accountPayable.findMany({
      where,
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
    prisma.accountPayable.count({ where }),
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
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: FORM_OPTION_LIMIT
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
        <form action="/financeiro/contas-pagar">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Filtros</p>
              <h2>Consulta de pagamentos</h2>
              <small className="product-detail">Status atual: {filterStatusLabels[statusFilter] || statusFilter}</small>
            </div>
            <div className="button-row">
              <Link className="secondary-button" href="/financeiro/contas-pagar">Limpar</Link>
              <button className="secondary-button" type="submit"><Filter size={17} />Filtrar</button>
            </div>
          </div>
          <div className="report-filter-grid">
            <label className="field">
              <span>Status</span>
              <select className="form-input" name="status" defaultValue={statusFilter}>
                <option value="ABERTOS">Abertos e programados</option>
                <option value="ABERTO">Somente abertos</option>
                <option value="PROGRAMADO">Somente programados</option>
                <option value="PAGO">Pagos</option>
                <option value="CANCELADO">Cancelados</option>
                <option value="TODOS">Todos</option>
              </select>
            </label>
            <label className="field">
              <span>Fornecedor</span>
              <select className="form-input" name="supplierId" defaultValue={supplierFilter}>
                <option value="">Todos</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Vencimento inicial</span>
              <input className="form-input mono" type="date" name="startDate" defaultValue={startDate} />
            </label>
            <label className="field">
              <span>Vencimento final</span>
              <input className="form-input mono" type="date" name="endDate" defaultValue={endDate} />
            </label>
            <label className="field">
              <span>Origem</span>
              <select className="form-input" name="origin" defaultValue={originFilter}>
                <option value="TODAS">Todas</option>
                <option value="NF">Recebimento/NF</option>
              </select>
            </label>
            <label className="field">
              <span>Buscar</span>
              <input className="form-input" name="q" defaultValue={search} placeholder="Titulo, documento, fornecedor ou pedido" />
            </label>
          </div>
        </form>
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
                  <th>Acoes</th>
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
                    <td>
                      <AccountPayableActions
                        payableId={payable.id}
                        number={payable.number}
                        linkedToReceipt={Boolean(payable.purchaseReceiptId)}
                        hasPayments={payable.payments.length > 0 || decimalToNumber(payable.paidAmount) > 0}
                        canForceDelete={canForceDeletePayables}
                        editData={{
                          dueDate: payable.dueDate.toISOString().slice(0, 10),
                          costCenter: payable.costCenter || "",
                          note: payable.note || ""
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {payables.length === 0 ? <tr><td colSpan={8}>Nenhuma conta a pagar gerada ainda.</td></tr> : null}
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
