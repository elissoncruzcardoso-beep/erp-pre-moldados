import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpCircle, CircleDollarSign, Filter, ShieldCheck } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
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

export default async function ContasReceberPage() {
  const session = await getSession();

  if (!session) redirect("/login?next=/financeiro/contas-receber");
  if (!session.permissions.includes("financeiro.view")) redirect("/dashboard");

  const prisma = getPrisma();
  const [receivables, customers, accountReceipts] = await Promise.all([
    prisma.accountReceivable.findMany({
      include: { customer: true, createdBy: true, receipts: true },
      orderBy: { dueDate: "asc" },
      take: 40
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
        <div className="table-header product-card-header">
          <div><p className="eyebrow">Filtros</p><h2>Consulta de recebiveis</h2></div>
          <PrototypeAction className="secondary-button" message="Filtros reais serao conectados depois."><Filter size={17} />Filtrar</PrototypeAction>
        </div>
        <div className="report-filter-grid">
          <div className="field"><span>Status</span><div className="input-like">Abertos</div></div>
          <div className="field"><span>Cliente</span><div className="input-like">Todos</div></div>
          <div className="field"><span>Periodo</span><div className="input-like">Vencimento</div></div>
          <div className="field"><span>Origem</span><div className="input-like">Manual / faturamento</div></div>
        </div>
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
            <span className="badge blue">{receivables.length} registros</span>
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
