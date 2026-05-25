import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CircleDollarSign, Landmark, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { FinanceModuleTabs } from "./_components/finance-module-tabs";

export const dynamic = "force-dynamic";

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function formatCurrency(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default async function FinanceiroPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/financeiro");
  }

  if (!session.permissions.includes("financeiro.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [payables, receivables, payments, accountReceipts, pendingReceipts] = await Promise.all([
    prisma.accountPayable.findMany({ include: { payments: true }, orderBy: { dueDate: "asc" }, take: 30 }),
    prisma.accountReceivable.findMany({ include: { receipts: true }, orderBy: { dueDate: "asc" }, take: 30 }),
    prisma.accountPayment.findMany({
      include: { accountPayable: { include: { supplier: true } }, paidBy: true },
      orderBy: { paymentDate: "desc" },
      take: 8
    }),
    prisma.accountReceipt.findMany({
      include: { accountReceivable: { include: { customer: true } }, receivedBy: true },
      orderBy: { receiptDate: "desc" },
      take: 8
    }),
    prisma.purchaseReceipt.count({
      where: {
        accountPayable: null,
        status: { in: ["LIBERADO_ESTOQUE", "DIVERGENTE"] }
      }
    })
  ]);

  const openPayables = payables.filter((payable) => payable.status === "ABERTO" || payable.status === "PROGRAMADO");
  const openReceivables = receivables.filter((receivable) => receivable.status === "ABERTO" || receivable.status === "FATURADO");
  const payableTotal = openPayables.reduce((sum, payable) => sum + decimalToNumber(payable.amount), 0);
  const receivableTotal = openReceivables.reduce((sum, receivable) => sum + decimalToNumber(receivable.amount), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  const receivedTotal = accountReceipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);

  return (
    <>
      <section className="product-hero-panel finance-hero-panel">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1>Resumo financeiro operacional</h1>
          <p className="lead">
            Visao consolidada do fluxo de caixa. As operacoes de contas a receber e contas a pagar ficam separadas nas abas do modulo.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
          <Link className="secondary-button" href="/financeiro/contas-receber">
            <ArrowUpCircle size={17} />
            Contas a receber
          </Link>
          <Link className="primary-button" href="/financeiro/contas-pagar">
            <ArrowDownCircle size={17} />
            Contas a pagar
          </Link>
        </div>
      </section>

      <FinanceModuleTabs active="resumo" />

      <section className="product-metric-grid finance-metric-grid">
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">A receber aberto</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivableTotal)}</strong>
          <span className="metric-sub">{openReceivables.length} titulo(s) pendente(s)</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">A pagar aberto</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatCurrency(payableTotal)}</strong>
          <span className="metric-sub">{openPayables.length} titulo(s) pendente(s)</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Entradas baixadas</span><ArrowUpCircle size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivedTotal)}</strong>
          <span className="metric-sub">{accountReceipts.length} recebimento(s) recentes</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">Saldo baixado</span><Landmark size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivedTotal - paidTotal)}</strong>
          <span className="metric-sub">{pendingReceipts} NF(s) aguardando titulo</span>
        </article>
      </section>

      <section className="finance-history-grid">
        <section className="product-section-card finance-history-card">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Ultimos recebimentos</p>
              <h2>Entradas financeiras</h2>
            </div>
          </div>
          <div className="finance-history-list">
            {accountReceipts.map((receipt) => (
              <article className="finance-history-row" key={receipt.id}>
                <ArrowUpCircle size={18} />
                <div>
                  <strong>{receipt.accountReceivable.customer.name}</strong>
                  <span className="product-detail mono">{receipt.accountReceivable.number} - {receipt.receiptDate.toLocaleDateString("pt-BR")}</span>
                </div>
                <strong className="mono">{formatCurrency(receipt.amount)}</strong>
              </article>
            ))}
            {accountReceipts.length === 0 ? <p className="metric-sub">Nenhum recebimento registrado ainda.</p> : null}
          </div>
        </section>

        <section className="product-section-card finance-history-card">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Ultimos pagamentos</p>
              <h2>Saidas financeiras</h2>
            </div>
          </div>
          <div className="finance-history-list">
            {payments.map((payment) => (
              <article className="finance-history-row" key={payment.id}>
                <ArrowDownCircle size={18} />
                <div>
                  <strong>{payment.accountPayable.supplier.name}</strong>
                  <span className="product-detail mono">{payment.accountPayable.number} - {payment.paymentDate.toLocaleDateString("pt-BR")}</span>
                </div>
                <strong className="mono">{formatCurrency(payment.amount)}</strong>
              </article>
            ))}
            {payments.length === 0 ? <p className="metric-sub">Nenhum pagamento registrado ainda.</p> : null}
          </div>
        </section>
      </section>
    </>
  );
}
