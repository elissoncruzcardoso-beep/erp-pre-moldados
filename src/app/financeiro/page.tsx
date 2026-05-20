import { redirect } from "next/navigation";
import { Banknote, CircleDollarSign, Filter, Landmark } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { AccountPayableForm } from "./account-payable-form";
import { AccountPaymentForm } from "./account-payment-form";
import { AccountReceiptForm } from "./account-receipt-form";
import { AccountReceivableForm } from "./account-receivable-form";

export const dynamic = "force-dynamic";

const payableStatusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  PROGRAMADO: "Programado",
  PAGO: "Pago",
  CANCELADO: "Cancelado"
};

const receivableStatusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  FATURADO: "Faturado",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

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

function badgeForStatus(status: string) {
  if (status === "PAGO") return "badge green";
  if (status === "CANCELADO") return "badge red";
  if (status === "PROGRAMADO") return "badge blue";
  return "badge orange";
}

export default async function FinanceiroPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/financeiro");
  }

  if (!session.permissions.includes("financeiro.view")) {
    redirect("/diretoria");
  }

  const prisma = getPrisma();
  const [payables, pendingReceipts, payments, receivables, customers, accountReceipts] = await Promise.all([
    prisma.accountPayable.findMany({
      include: {
        supplier: true,
        payments: true,
        purchaseReceipt: {
          include: {
            purchaseOrder: true,
            purchaseOrderItem: {
              include: {
                item: true
              }
            }
          }
        },
        createdBy: true
      },
      orderBy: { dueDate: "asc" },
      take: 30
    }),
    prisma.purchaseReceipt.findMany({
      where: {
        accountPayable: null,
        status: { in: ["LIBERADO_ESTOQUE", "DIVERGENTE"] }
      },
      include: {
        purchaseOrder: {
          include: {
            supplier: true
          }
        },
        purchaseOrderItem: {
          include: {
            item: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.accountPayment.findMany({
      include: {
        accountPayable: {
          include: {
            supplier: true
          }
        },
        paidBy: true
      },
      orderBy: { paymentDate: "desc" },
      take: 20
    }),
    prisma.accountReceivable.findMany({
      include: {
        customer: true,
        createdBy: true,
        receipts: true
      },
      orderBy: { dueDate: "asc" },
      take: 30
    }),
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.accountReceipt.findMany({
      include: {
        accountReceivable: {
          include: {
            customer: true
          }
        },
        receivedBy: true
      },
      orderBy: { receiptDate: "desc" },
      take: 20
    })
  ]);

  const openPayables = payables.filter((payable) => payable.status === "ABERTO" || payable.status === "PROGRAMADO");
  const openReceivables = receivables.filter((receivable) => receivable.status === "ABERTO" || receivable.status === "FATURADO");
  const payableTotal = openPayables.reduce((sum, payable) => sum + decimalToNumber(payable.amount), 0);
  const receivableTotal = openReceivables.reduce((sum, receivable) => sum + decimalToNumber(receivable.amount), 0);
  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);
  const dueNext30 = openPayables
    .filter((payable) => payable.dueDate <= next30)
    .reduce((sum, payable) => sum + decimalToNumber(payable.amount), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  const receivedTotal = accountReceipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
  const payableOptions = openPayables.map((payable) => {
    const paid = payable.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);

    return {
      id: payable.id,
      number: payable.number,
      supplier: payable.supplier.name,
      remainingAmount: Math.max(decimalToNumber(payable.amount) - paid, 0)
    };
  }).filter((payable) => payable.remainingAmount > 0);
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
      <section className="page-head">
        <div>
          <p className="eyebrow">Financeiro e compras</p>
          <h1>Contas a pagar operacional</h1>
          <p className="lead">
            Títulos reais gerados a partir do recebimento/NF em Suprimentos. Cada conta mantém
            vínculo com fornecedor, pedido, recebimento e item conferido.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <Banknote size={16} />
            Operador: {session.name}
          </span>
        </div>
      </section>

      <section className="finance-grid" style={{ marginBottom: 16 }}>
        <article className="finance-tile accent-blue">
          <div className="metric-top"><span className="mono">Contas a receber</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivableTotal)}</strong>
          <span className="metric-sub">{openReceivables.length} título(s) aberto(s)</span>
        </article>
        <article className="finance-tile accent-orange">
          <div className="metric-top"><span className="mono">Contas a pagar</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatCurrency(payableTotal)}</strong>
          <span className="metric-sub">{openPayables.length} título(s) aberto(s)</span>
        </article>
        <article className="finance-tile accent-gray">
          <div className="metric-top"><span className="mono">Total pago</span><Landmark size={22} /></div>
          <strong className="metric-value">{formatCurrency(paidTotal)}</strong>
          <span className="metric-sub">Histórico de baixas</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <section className="card accent-blue span-3">
          <p className="eyebrow">Entrada</p>
          <h2>Criar conta a receber</h2>
          <AccountReceivableForm
            customers={customers.map((customer) => ({
              id: customer.id,
              code: customer.code,
              name: customer.name
            }))}
          />
        </section>

        <section className="card accent-blue span-3">
          <p className="eyebrow">Recebimento</p>
          <h2>Baixar conta a receber</h2>
          <AccountReceiptForm receivables={receivableOptions} />
        </section>

        <section className="card accent-orange span-3">
          <p className="eyebrow">Novo título</p>
          <h2>Gerar conta a pagar</h2>
          <AccountPayableForm
            receipts={pendingReceipts.map((receipt) => ({
              id: receipt.id,
              number: receipt.number,
              supplier: receipt.purchaseOrder.supplier.name,
              document: receipt.invoiceNumber || receipt.number,
              amount: decimalToNumber(receipt.totalCost)
            }))}
          />
        </section>

        <section className="card accent-orange span-3">
          <p className="eyebrow">Baixa</p>
          <h2>Registrar pagamento</h2>
          <AccountPaymentForm payables={payableOptions} />
        </section>

        <section className="filter-bar span-4" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Origem</label>
            <div className="input-like">Recebimento/NF</div>
          </div>
          <div className="field">
            <label>Status</label>
            <div className="input-like">Abertos</div>
          </div>
          <div className="field">
            <label>Pendências</label>
            <div className="input-like">{pendingReceipts.length} NF sem título</div>
          </div>
          <div className="field">
            <label>Período</label>
            <div className="input-like">{formatCurrency(dueNext30)} em 30 dias</div>
          </div>
          <PrototypeAction className="warning-button" message="Filtros reais serão conectados aos parâmetros da tela financeira.">
            <Filter size={17} />
            Filtrar
          </PrototypeAction>
        </section>
      </section>

      <section className="finance-grid" style={{ marginBottom: 16 }}>
        <article className="finance-tile accent-blue">
          <div className="metric-top"><span className="mono">Recebido</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivedTotal)}</strong>
          <span className="metric-sub">Histórico de entradas</span>
        </article>
        <article className="finance-tile accent-orange">
          <div className="metric-top"><span className="mono">Pago</span><Banknote size={22} /></div>
          <strong className="metric-value">{formatCurrency(paidTotal)}</strong>
          <span className="metric-sub">Histórico de saídas</span>
        </article>
        <article className="finance-tile accent-gray">
          <div className="metric-top"><span className="mono">Saldo operacional</span><Landmark size={22} /></div>
          <strong className="metric-value">{formatCurrency(receivedTotal - paidTotal)}</strong>
          <span className="metric-sub">Recebido menos pago</span>
        </article>
      </section>

      <section className="grid-12">
        <div className="table-shell span-7">
          <div className="table-header">
            <div>
              <p className="eyebrow">Saídas</p>
              <h2>Contas a pagar reais</h2>
            </div>
            <span className="badge blue">{payables.length} registros</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Fornecedor / NF</th>
                <th>Origem</th>
                <th>Valor</th>
                <th>Pago</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((payable) => (
                <tr key={payable.id}>
                  <td className="mono">{payable.number}</td>
                  <td>
                    {payable.supplier.name}
                    <br />
                    <small>{payable.documentNumber || "-"}</small>
                  </td>
                  <td>
                    <span className="mono">{payable.purchaseReceipt.purchaseOrder.number}</span>
                    <br />
                    <small>{payable.purchaseReceipt.purchaseOrderItem.item.description}</small>
                  </td>
                  <td className="mono">{formatCurrency(payable.amount)}</td>
                  <td className="mono">{formatCurrency(payable.paidAmount)}</td>
                  <td>{payable.dueDate.toLocaleDateString("pt-BR")}</td>
                  <td><span className={badgeForStatus(payable.status)}>{payableStatusLabels[payable.status] || payable.status}</span></td>
                </tr>
              ))}
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhuma conta a pagar gerada ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="table-shell span-5">
          <div className="table-header">
            <div>
              <p className="eyebrow">Entradas</p>
              <h2>Contas a receber</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Recebido</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((receivable) => (
                <tr key={receivable.id}>
                  <td className="mono">{receivable.number}</td>
                  <td>
                    {receivable.customer.name}
                    <br />
                    <small>{receivable.description}</small>
                  </td>
                  <td className="mono">{formatCurrency(receivable.amount)}</td>
                  <td className="mono">{formatCurrency(receivable.receivedAmount)}</td>
                  <td>{receivable.dueDate.toLocaleDateString("pt-BR")}</td>
                  <td><span className={badgeForStatus(receivable.status)}>{receivableStatusLabels[receivable.status] || receivable.status}</span></td>
                </tr>
              ))}
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhuma conta a receber criada ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-shell" style={{ marginTop: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Histórico financeiro</p>
            <h2>Pagamentos registrados</h2>
          </div>
          <span className="badge blue">{payments.length} baixa(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Título</th>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Referência</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paymentDate.toLocaleDateString("pt-BR")}</td>
                <td className="mono">{payment.accountPayable.number}</td>
                <td>{payment.accountPayable.supplier.name}</td>
                <td className="mono">{formatCurrency(payment.amount)}</td>
                <td><span className="badge blue">{payment.method}</span></td>
                <td>{payment.reference || "-"}</td>
                <td>{payment.paidBy.name}</td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhum pagamento registrado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginTop: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Histórico financeiro</p>
            <h2>Recebimentos de clientes</h2>
          </div>
          <span className="badge blue">{accountReceipts.length} baixa(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Título</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Referência</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {accountReceipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>{receipt.receiptDate.toLocaleDateString("pt-BR")}</td>
                <td className="mono">{receipt.accountReceivable.number}</td>
                <td>{receipt.accountReceivable.customer.name}</td>
                <td className="mono">{formatCurrency(receipt.amount)}</td>
                <td><span className="badge blue">{receipt.method}</span></td>
                <td>{receipt.reference || "-"}</td>
                <td>{receipt.receivedBy.name}</td>
              </tr>
            ))}
            {accountReceipts.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhum recebimento de cliente registrado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
