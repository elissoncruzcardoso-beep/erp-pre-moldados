import Link from "next/link";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { ArrowLeft, ArrowUpCircle, CircleDollarSign, ExternalLink, Filter, ReceiptText, ShieldCheck } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { findRecentActiveAccountReceipts } from "@/lib/finance/queries";
import { decimalToNumber, formatMoney } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { FORM_OPTION_LIMIT } from "@/lib/query-limits";
import { AccountReceiptForm } from "../account-receipt-form";
import { AccountReceivableForm } from "../account-receivable-form";
import { AccountReceivableActions } from "../account-receivable-actions";
import { FinanceModuleTabs } from "../_components/finance-module-tabs";

export const dynamic = "force-dynamic";

const receivableStatusLabels: Record<string, string> = {
  ABERTO: "Em aberto",
  FATURADO: "A receber",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

const filterStatusLabels: Record<string, string> = {
  ABERTOS: "Em aberto e a receber",
  ABERTO: "Somente em aberto",
  FATURADO: "Somente a receber",
  RECEBIDO: "Recebidos",
  CANCELADO: "Cancelados",
  TODOS: "Todos"
};

function badgeForStatus(status: string) {
  if (status === "RECEBIDO") return "badge green";
  if (status === "CANCELADO") return "badge red";
  if (status === "FATURADO") return "badge blue";
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

type PageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

function firstParam(params: SearchParamsLike, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function ContasReceberPage({ searchParams }: PageProps) {
  const session = await requirePageSession({ nextPath: "/financeiro/contas-receber", permission: "financeiro.view" });

  const params = (await searchParams) || {};
  const statusFilter = firstParam(params, "status") || "ABERTOS";
  const customerFilter = firstParam(params, "customerId");
  const originFilter = firstParam(params, "origin") || "TODAS";
  const startDate = firstParam(params, "startDate");
  const endDate = firstParam(params, "endDate");
  const search = firstParam(params, "q").trim();
  const pagination = parsePagination(params, {
    pageParam: "receberPage",
    defaultPageSize: 12,
    maxPageSize: 80
  });

  const where: Prisma.AccountReceivableWhereInput = {};
  const andFilters: Prisma.AccountReceivableWhereInput[] = [];

  if (statusFilter === "ABERTOS") {
    andFilters.push({ status: { in: ["ABERTO", "FATURADO"] } });
  } else if (statusFilter !== "TODOS") {
    andFilters.push({ status: statusFilter as AccountReceivableStatus });
  }

  if (customerFilter) {
    andFilters.push({ customerId: customerFilter });
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

  if (originFilter === "VENDAS") {
    andFilters.push({ directSaleId: { not: null } });
  } else if (originFilter === "MANUAL") {
    andFilters.push({ directSaleId: null });
  }

  if (search) {
    andFilters.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { documentNumber: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { directSale: { is: { number: { contains: search, mode: "insensitive" } } } },
        { customer: { name: { contains: search, mode: "insensitive" } } }
      ]
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  const prisma = getPrisma();
  const openWhere: Prisma.AccountReceivableWhereInput = {
    ...where,
    AND: [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { status: { in: ["ABERTO", "FATURADO"] } }
    ]
  };

  const [receivables, receivablesCount, receivableStats, openReceivableOptionsSource, customers, accountReceipts] = await Promise.all([
    prisma.accountReceivable.findMany({
      where,
      include: { customer: true, createdBy: true, receipts: true, directSale: true },
      orderBy: { dueDate: "asc" },
      skip: pagination.skip,
      take: pagination.pageSize
    }),
    prisma.accountReceivable.count({ where }),
    prisma.accountReceivable.aggregate({
      where: openWhere,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountReceivable.findMany({
      where: openWhere,
      include: { customer: true, receipts: true },
      orderBy: { dueDate: "asc" },
      take: 100
    }),
    prisma.customer.findMany({ where: { active: true }, orderBy: { code: "asc" }, take: FORM_OPTION_LIMIT }),
    findRecentActiveAccountReceipts(prisma, 20)
  ]);

  const receivableTotal = decimalToNumber(receivableStats._sum.amount);
  const receivedTotal = accountReceipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
  const receivableOptions = openReceivableOptionsSource.map((receivable) => {
    const received = receivable.receipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
    return {
      id: receivable.id,
      number: receivable.number,
      customer: receivable.customer.name,
      remainingAmount: Math.max(decimalToNumber(receivable.amount) - received, 0)
    };
  }).filter((receivable) => receivable.remainingAmount > 0);
  const paginationMeta = getPaginationMeta(receivablesCount, pagination.page, pagination.pageSize);

  return (
    <>
      <section className="product-hero-panel finance-hero-panel">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1>Contas a receber</h1>
          <p className="lead">Lancamento, baixa e acompanhamento dos valores a receber de clientes, medicoes e faturamentos.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} />Acesso: {session.role}</span>
          <Link className="secondary-button" href="/financeiro"><ArrowLeft size={17} />Resumo</Link>
        </div>
      </section>

      <FinanceModuleTabs active="receber" />

      <section className="product-metric-grid finance-metric-grid">
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Aberto</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">{formatMoney(receivableTotal)}</strong>
          <span className="metric-sub">{receivableStats._count._all} titulo(s) em aberto</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Recebido</span><ArrowUpCircle size={22} /></div>
          <strong className="metric-value">{formatMoney(receivedTotal)}</strong>
          <span className="metric-sub">{accountReceipts.length} baixa(s) recentes</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">Clientes ativos</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">{customers.length}</strong>
          <span className="metric-sub">Disponiveis para lancamento</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Pendentes baixa</span><ArrowUpCircle size={22} /></div>
          <strong className="metric-value">{receivableOptions.length}</strong>
          <span className="metric-sub">Titulos com saldo</span>
        </article>
      </section>

      <section className="product-section-card finance-filter-panel">
        <form action="/financeiro/contas-receber">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Filtros</p>
              <h2>Consulta de recebiveis</h2>
              <small className="product-detail">Status atual: {filterStatusLabels[statusFilter] || statusFilter}</small>
            </div>
            <div className="button-row">
              <Link className="secondary-button" href="/financeiro/contas-receber">Limpar</Link>
              <button className="secondary-button" type="submit"><Filter size={17} />Filtrar</button>
            </div>
          </div>
          <div className="report-filter-grid">
            <label className="field">
              <span>Status</span>
              <select className="form-input" name="status" defaultValue={statusFilter}>
                <option value="ABERTOS">Em aberto e a receber</option>
                <option value="ABERTO">Somente em aberto</option>
                <option value="FATURADO">Somente a receber</option>
                <option value="RECEBIDO">Recebidos</option>
                <option value="CANCELADO">Cancelados</option>
                <option value="TODOS">Todos</option>
              </select>
            </label>
            <label className="field">
              <span>Cliente</span>
              <select className="form-input" name="customerId" defaultValue={customerFilter}>
                <option value="">Todos</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.code} - {customer.name}</option>
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
                <option value="VENDAS">Vendas diretas</option>
                <option value="MANUAL">Lancamento manual</option>
              </select>
            </label>
            <label className="field">
              <span>Buscar</span>
              <input className="form-input" name="q" defaultValue={search} placeholder="Titulo, documento, cliente ou descricao" />
            </label>
          </div>
        </form>
      </section>

      <section className="finance-action-grid two-columns">
        <section className="product-section-card finance-action-card">
          <p className="eyebrow">Entrada</p>
          <h2>Criar conta a receber</h2>
          <AccountReceivableForm customers={customers.map((customer) => ({ id: customer.id, code: customer.code, name: customer.name }))} />
        </section>
        <section className="product-section-card finance-action-card">
          <p className="eyebrow">Baixa</p>
          <h2>Registrar recebimento</h2>
          <AccountReceiptForm receivables={receivableOptions} />
        </section>
      </section>

      <section className="finance-table-grid single">
        <div className="table-shell product-table-shell">
          <div className="table-header">
            <div><p className="eyebrow">Entradas</p><h2>Contas a receber</h2></div>
            <span className="badge blue">{receivablesCount} registro(s) filtrado(s)</span>
          </div>
          <div className="table-scroll">
            <table className="technical-items-table finance-data-table">
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Cliente</th>
                  <th className="number-cell">Valor</th>
                  <th className="number-cell">Recebido</th>
                  <th>Vencimento</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td className="mono">{receivable.number}</td>
                    <td><strong>{receivable.customer.name}</strong><small className="product-detail">{receivable.description}</small></td>
                    <td className="mono number-cell">{formatMoney(receivable.amount)}</td>
                    <td className="mono number-cell">{formatMoney(receivable.receivedAmount)}</td>
                    <td>{receivable.dueDate.toLocaleDateString("pt-BR")}</td>
                    <td>
                      {receivable.directSale ? (
                        <div className="finance-origin-cell">
                          <span className="badge blue">
                            <ReceiptText size={13} />
                            Venda direta
                          </span>
                          <Link className="finance-origin-link" href={`/vendas/recibos/${receivable.directSale.id}`}>
                            {receivable.directSale.number}
                            <ExternalLink size={13} />
                          </Link>
                        </div>
                      ) : (
                        <span className="badge gray">Manual</span>
                      )}
                    </td>
                    <td><span className={badgeForStatus(receivable.status)}>{receivableStatusLabels[receivable.status] || receivable.status}</span></td>
                    <td>
                      <AccountReceivableActions
                        receivableId={receivable.id}
                        number={receivable.number}
                        customers={customers.map((customer) => ({ id: customer.id, code: customer.code, name: customer.name }))}
                        linkedToSale={Boolean(receivable.directSaleId)}
                        hasReceipts={receivable.receipts.length > 0 || decimalToNumber(receivable.receivedAmount) > 0}
                        receipts={receivable.receipts.map((receipt) => ({
                          id: receipt.id,
                          receiptDate: receipt.receiptDate.toLocaleDateString("pt-BR"),
                          amount: decimalToNumber(receipt.amount),
                          method: receipt.method,
                          reference: receipt.reference || ""
                        }))}
                        editData={{
                          customerId: receivable.customerId,
                          description: receivable.description,
                          documentNumber: receivable.documentNumber || "",
                          costCenter: receivable.costCenter || "",
                          dueDate: receivable.dueDate.toISOString().slice(0, 10),
                          amount: decimalToNumber(receivable.amount).toString(),
                          note: receivable.note || ""
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {receivables.length === 0 ? <tr><td colSpan={8}>Nenhuma conta a receber criada ainda.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pathname="/financeiro/contas-receber"
            params={params}
            meta={paginationMeta}
            pageParam="receberPage"
          />
        </div>
      </section>
    </>
  );
}
