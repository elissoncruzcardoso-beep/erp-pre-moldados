import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownCircle, ArrowLeft, Banknote, Filter, ShieldCheck } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
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

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) return Number(value.toString());
  return Number(value ?? 0);
}

function formatCurrency(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeForStatus(status: string) {
  if (status === "PAGO") return "badge green";
  if (status === "CANCELADO") return "badge red";
  if (status === "PROGRAMADO") return "badge blue";
  return "badge orange";
}

export default async function ContasPagarPage() {
  const session = await getSession();

  if (!session) redirect("/login?next=/financeiro/contas-pagar");
  if (!session.permissions.includes("financeiro.view")) redirect("/dashboard");

  const prisma = getPrisma();
  const [payables, pendingReceipts, payments] = await Promise.all([
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
      take: 40
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

  const openPayables = payables.filter((payable) => payable.status === "ABERTO" || payable.status === "PROGRAMADO");
  const payableTotal = openPayables.reduce((sum, payable) => sum + decimalToNumber(payable.amount), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);
  const dueNext30 = openPayables.filter((payable) => payable.dueDate <= next30).reduce((sum, payable) => sum + decimalToNumber(payable.amount), 0);
  const payableOptions = openPayables.map((payable) => {
    const paid = payable.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
    return {
      id: payable.id,
      number: payable.number,
      supplier: payable.supplier.name,
      remainingAmount: Math.max(decimalToNumber(payable.amount) - paid, 0)
    };
  }).filter((payable) => payable.remainingAmount > 0);

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
          <strong className="metric-value">{formatCurrency(payableTotal)}</strong>
          <span className="metric-sub">{openPayables.length} titulo(s) em aberto</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Pago</span><ArrowDownCircle size={22} /></div>
          <strong className="metric-value">{formatCurrency(paidTotal)}</strong>
          <span className="metric-sub">{payments.length} baixa(s) recentes</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Proximos 30 dias</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatCurrency(dueNext30)}</strong>
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
            <span className="badge blue">{payables.length} registros</span>
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
                    <td className="mono number-cell">{formatCurrency(payable.amount)}</td>
                    <td className="mono number-cell">{formatCurrency(payable.paidAmount)}</td>
                    <td>{payable.dueDate.toLocaleDateString("pt-BR")}</td>
                    <td><span className={badgeForStatus(payable.status)}>{payableStatusLabels[payable.status] || payable.status}</span></td>
                  </tr>
                ))}
                {payables.length === 0 ? <tr><td colSpan={7}>Nenhuma conta a pagar gerada ainda.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
