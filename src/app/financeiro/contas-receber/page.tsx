import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { ArrowLeft, ArrowUpCircle, CircleDollarSign, Filter, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { AccountReceiptForm } from "../account-receipt-form";
import { AccountReceivableForm } from "../account-receivable-form";
import { FinanceModuleTabs } from "../_components/finance-module-tabs";

export const dynamic = "force-dynamic";

const receivableStatusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  FATURADO: "Faturado",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) return Number(value.toString());
  return Number(value ?? 0);
}

function formatCurrency(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function ContasReceberPage({ searchParams }: PageProps) {
  const session = await getSession();

  if (!session) redirect("/login?next=/financeiro/contas-receber");
  if (!session.permissions.includes("financeiro.view")) redirect("/dashboard");

  const params = (await searchParams) || {};
  const statusFilter = firstParam(params, "status") || "ABERTOS";
  const customerFilter = firstParam(params, "customerId");
  const originFilter = firstParam(params, "origin") || "TODAS";
  const startDate = firstParam(params, "startDate");
  const endDate = firstParam(params, "endDate");
  const search = firstParam(params, "q").trim();

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
        { customer: { name: { contains: search, mode: "insensitive" } } }
      ]
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  const prisma = getPrisma();
  const [receivables, customers, accountReceipts] = await Promise.all([
    prisma.accountReceivable.findMany({
      where,
      include: { customer: true, createdBy: true, receipts: true, directSale: true },
      orderBy: { dueDate: "asc" },
      take: 80
    }),
    prisma.customer.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.accountReceipt.findMany({
      include: { accountReceivable: { include: { customer: true } }, receivedBy: true },
      orderBy: { receiptDate: "desc" },
      take: 20
    })
  ]);

  const openReceivables = receivables.filter((receivable) => receivable.status === "ABERTO" || receivable.status === "FATURADO");
  const receivableTotal = openReceivables.reduce((sum, receivable) => sum + decimalToNumber(receivable.amount), 0);
  const receivedTotal = accountReceipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
  const receivableOptions = openReceivables.map((receivable) => {
    const received = receivable.receipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
    return {
      id: receivable.id,
      number: receivable.number,
      customer: receivable.customer.name,
      remainingAmount: Math.max(decimalToNumber(receivable.amount) - received, 0)
    };
  }).filter((receivable) => receivable.remainingAmount > 0);

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
          <strong className="metric-value">{formatCurrency(receivableTotal)}</strong>
          <span className="metric-sub">{openReceivables.length} titulo(s) em aberto</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Recebido</span><ArrowUpCircle size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivedTotal)}</strong>
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
            <div><p className="eyebrow">Filtros</p><h2>Consulta de recebiveis</h2></div>
            <div className="button-row">
              <Link className="secondary-button" href="/financeiro/contas-receber">Limpar</Link>
              <button className="secondary-button" type="submit"><Filter size={17} />Filtrar</button>
            </div>
          </div>
          <div className="report-filter-grid">
            <label className="field">
              <span>Status</span>
              <select className="form-input" name="status" defaultValue={statusFilter}>
                <option value="ABERTOS">Abertos e faturados</option>
                <option value="ABERTO">Somente abertos</option>
                <option value="FATURADO">Somente faturados</option>
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
            <span className="badge blue">{receivables.length} registro(s) filtrado(s)</span>
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td className="mono">{receivable.number}</td>
                    <td><strong>{receivable.customer.name}</strong><small className="product-detail">{receivable.description}</small></td>
                    <td className="mono number-cell">{formatCurrency(receivable.amount)}</td>
                    <td className="mono number-cell">{formatCurrency(receivable.receivedAmount)}</td>
                    <td>{receivable.dueDate.toLocaleDateString("pt-BR")}</td>
                    <td><span className={badgeForStatus(receivable.status)}>{receivableStatusLabels[receivable.status] || receivable.status}</span></td>
                  </tr>
                ))}
                {receivables.length === 0 ? <tr><td colSpan={6}>Nenhuma conta a receber criada ainda.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
