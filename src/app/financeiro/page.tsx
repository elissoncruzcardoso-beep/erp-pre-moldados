import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountPayableStatus, AccountReceivableStatus, Prisma } from "@prisma/client";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CircleDollarSign, Landmark, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { activeAccountReceiptWhere, findRecentActiveAccountReceipts } from "@/lib/finance/queries";
import { decimalToNumber, formatMoney } from "@/lib/formatters";
import { FinanceModuleTabs } from "./_components/finance-module-tabs";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/financeiro");
  }

  if (!session.permissions.includes("financeiro.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const openPayablesWhere: Prisma.AccountPayableWhereInput = {
    status: { in: [AccountPayableStatus.ABERTO, AccountPayableStatus.PROGRAMADO] }
  };
  const openReceivablesWhere: Prisma.AccountReceivableWhereInput = {
    status: { in: [AccountReceivableStatus.ABERTO, AccountReceivableStatus.FATURADO] }
  };
  const [
    payableStats,
    receivableStats,
    paymentStats,
    receiptStats,
    payments,
    accountReceipts,
    pendingReceipts
  ] = await Promise.all([
    prisma.accountPayable.aggregate({
      where: openPayablesWhere,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountReceivable.aggregate({
      where: openReceivablesWhere,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountPayment.aggregate({
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountReceipt.aggregate({
      where: activeAccountReceiptWhere(),
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.accountPayment.findMany({
      include: { accountPayable: { include: { supplier: true } }, paidBy: true },
      orderBy: { paymentDate: "desc" },
      take: 8
    }),
    findRecentActiveAccountReceipts(prisma, 8),
    prisma.purchaseReceipt.count({
      where: {
        accountPayable: null,
        status: { in: ["LIBERADO_ESTOQUE", "DIVERGENTE"] }
      }
    })
  ]);

  const payableTotal = decimalToNumber(payableStats._sum.amount);
  const receivableTotal = decimalToNumber(receivableStats._sum.amount);
  const paidTotal = decimalToNumber(paymentStats._sum.amount);
  const receivedTotal = decimalToNumber(receiptStats._sum.amount);

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
          <strong className="metric-value">{formatMoney(receivableTotal)}</strong>
          <span className="metric-sub">{receivableStats._count._all} titulo(s) pendente(s)</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">A pagar aberto</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatMoney(payableTotal)}</strong>
          <span className="metric-sub">{payableStats._count._all} titulo(s) pendente(s)</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Entradas baixadas</span><ArrowUpCircle size={22} /></div>
          <strong className="metric-value">{formatMoney(receivedTotal)}</strong>
          <span className="metric-sub">{receiptStats._count._all} recebimento(s) validos</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">Caixa realizado</span><Landmark size={22} /></div>
          <strong className="metric-value">{formatMoney(receivedTotal - paidTotal)}</strong>
          <span className="metric-sub">Entradas recebidas - {paymentStats._count._all} saida(s) paga(s). {pendingReceipts} NF(s) aguardando titulo</span>
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
                <strong className="mono">{formatMoney(receipt.amount)}</strong>
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
                <strong className="mono">{formatMoney(payment.amount)}</strong>
              </article>
            ))}
            {payments.length === 0 ? <p className="metric-sub">Nenhum pagamento registrado ainda.</p> : null}
          </div>
        </section>
      </section>
    </>
  );
}
