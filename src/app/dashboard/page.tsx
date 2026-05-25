import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Factory,
  PackageCheck,
  RadioTower,
  WalletCards
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

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
    currency: "BRL",
    maximumFractionDigits: 2
  });
}

function formatQuantity(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });
}

const movementLabels: Record<string, string> = {
  ENTRADA_COMPRA: "Entrada de compra",
  SAIDA_PRODUCAO: "Saída para produção",
  ENTRADA_PRODUCAO: "Entrada de produção",
  TRANSFERENCIA: "Transferência",
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
  RESERVA: "Reserva",
  ESTORNO: "Estorno"
};

const batchStatusLabels: Record<string, string> = {
  EM_CURA: "Em cura",
  APTA_RETIRADA: "Apta retirada",
  RETIRADA_PARCIAL: "Liberada parcial",
  RETIRADA_TOTAL: "Retirada total",
  BLOQUEADA: "Bloqueada"
};

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/dashboard");
  }

  if (!session.permissions.includes("dashboard.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  if (session.permissions.includes("producao.manage")) {
    await autoReleaseCuredBatches({ userId: session.userId });
  }

  const [batches, accountReceipts, accountPayments, receivables, payables, stockMovements] =
    await Promise.all([
      prisma.productionBatch.findMany({
        include: {
          item: {
            include: {
              unit: true
            }
          },
          dailyLogItem: {
            include: {
              dailyLog: true
            }
          }
        },
        orderBy: [{ producedAt: "desc" }, { code: "desc" }],
        take: 40
      }),
      prisma.accountReceipt.findMany({
        include: {
          accountReceivable: {
            include: {
              customer: true
            }
          }
        },
        orderBy: { receiptDate: "desc" },
        take: 8
      }),
      prisma.accountPayment.findMany({
        include: {
          accountPayable: {
            include: {
              supplier: true
            }
          }
        },
        orderBy: { paymentDate: "desc" },
        take: 8
      }),
      prisma.accountReceivable.findMany({
        where: {
          status: { in: ["ABERTO", "FATURADO"] }
        },
        include: {
          customer: true,
          receipts: true
        },
        orderBy: { dueDate: "asc" },
        take: 12
      }),
      prisma.accountPayable.findMany({
        where: {
          status: { in: ["ABERTO", "PROGRAMADO"] }
        },
        include: {
          supplier: true,
          payments: true
        },
        orderBy: { dueDate: "asc" },
        take: 12
      }),
      prisma.stockMovement.findMany({
        include: {
          item: {
            include: {
              unit: true
            }
          },
          originWarehouse: true,
          targetWarehouse: true,
          user: true
        },
        orderBy: { createdAt: "desc" },
        take: 14
      })
    ]);

  const curingBatches = batches.filter((batch) => batch.status === "EM_CURA" || batch.status === "RETIRADA_PARCIAL");
  const readyBatches = batches.filter((batch) => batch.status === "APTA_RETIRADA");
  const receiptTotal = accountReceipts.reduce((sum, receipt) => sum + decimalToNumber(receipt.amount), 0);
  const paymentTotal = accountPayments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  const openReceivableTotal = receivables.reduce((sum, receivable) => {
    const received = receivable.receipts.reduce((total, receipt) => total + decimalToNumber(receipt.amount), 0);
    return sum + Math.max(decimalToNumber(receivable.amount) - received, 0);
  }, 0);
  const openPayableTotal = payables.reduce((sum, payable) => {
    const paid = payable.payments.reduce((total, payment) => total + decimalToNumber(payment.amount), 0);
    return sum + Math.max(decimalToNumber(payable.amount) - paid, 0);
  }, 0);
  const readyQuantity = readyBatches.reduce((sum, batch) => sum + decimalToNumber(batch.releasedQuantity), 0);
  const curingQuantity = curingBatches.reduce((sum, batch) => sum + decimalToNumber(batch.curingQuantity), 0);
  const entryMovements = stockMovements.filter((movement) => movement.type.includes("ENTRADA") || movement.type === "AJUSTE_POSITIVO");
  const exitMovements = stockMovements.filter((movement) => movement.type.includes("SAIDA") || movement.type === "AJUSTE_NEGATIVO" || movement.type === "RESERVA");

  return (
    <>
      <section className="page-head dashboard-hero">
        <div>
          <p className="eyebrow">Dashboard operacional</p>
          <h1>Central de fábrica, cura e caixa</h1>
          <p className="lead">
            Painel em tempo real para acompanhar peças em cura, liberação para retirada,
            recebimentos, saídas financeiras e movimentos de materiais.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill dashboard-signal">
            <RadioTower size={16} />
            Dados conectados
          </span>
          <Link href="/producao" className="primary-button">
            <Factory size={17} />
            Produção
          </Link>
        </div>
      </section>

      <section className="grid-12 dashboard-modern">
        <article className="metric-card futuristic-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Peças em cura</span>
            <Clock3 size={22} />
          </div>
          <strong className="metric-value">{curingBatches.length}</strong>
          <span className="metric-sub">{formatQuantity(curingQuantity)} peças em controle de cura/qualidade</span>
          <details className="dashboard-details">
            <summary>Abrir lista</summary>
            <div className="mini-list">
              {curingBatches.map((batch) => (
                <Link href="/producao/pecas-em-cura" className="mini-list-row" key={batch.id}>
                  <span>
                    <strong>{batch.code}</strong>
                    <small>{batch.item.description}</small>
                  </span>
                  <span className="badge blue">{formatQuantity(batch.curingQuantity)} {batch.item.unit.code}</span>
                </Link>
              ))}
              {curingBatches.length === 0 ? <p className="metric-sub">Nenhuma peça em cura neste momento.</p> : null}
            </div>
          </details>
        </article>

        <article className="metric-card futuristic-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Aptas à retirada</span>
            <PackageCheck size={22} />
          </div>
          <strong className="metric-value">{readyBatches.length}</strong>
          <span className="metric-sub">{formatQuantity(readyQuantity)} peças prontas em lista</span>
          <details className="dashboard-details">
            <summary>Abrir lista</summary>
            <div className="mini-list">
              {readyBatches.map((batch) => (
                <Link href="/producao/pecas-em-cura" className="mini-list-row" key={batch.id}>
                  <span>
                    <strong>{batch.code}</strong>
                    <small>{batch.item.description}</small>
                  </span>
                  <span className="badge green">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</span>
                </Link>
              ))}
              {readyBatches.length === 0 ? <p className="metric-sub">Nenhuma peça apta para retirada.</p> : null}
            </div>
          </details>
        </article>

        <article className="metric-card futuristic-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Recebimentos</span>
            <ArrowDownLeft size={22} />
          </div>
          <strong className="metric-value">{formatCurrency(receiptTotal)}</strong>
          <span className="metric-sub">{formatCurrency(openReceivableTotal)} em aberto no financeiro</span>
          <Link href="/financeiro" className="secondary-button mini-button">Ver financeiro</Link>
        </article>

        <article className="metric-card futuristic-card accent-orange span-3">
          <div className="metric-top">
            <span className="mono">Saídas financeiras</span>
            <ArrowUpRight size={22} />
          </div>
          <strong className="metric-value">{formatCurrency(paymentTotal)}</strong>
          <span className="metric-sub">{formatCurrency(openPayableTotal)} a pagar programado/aberto</span>
          <Link href="/financeiro" className="secondary-button mini-button">Ver pagamentos</Link>
        </article>

        <section className="table-shell dashboard-panel span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Atividades recentes</p>
              <h2>Peças prontas em lista</h2>
            </div>
            <span className="badge green">{readyBatches.length} lotes</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Peça</th>
                <th>Qtd. pronta</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {readyBatches.map((batch) => (
                <tr key={batch.id}>
                  <td className="mono">{batch.code}</td>
                  <td>{batch.item.description}</td>
                  <td className="mono">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</td>
                  <td className="mono">{batch.producedAt.toLocaleDateString("pt-BR")}</td>
                  <td><span className="badge green">{batchStatusLabels[batch.status] || batch.status}</span></td>
                </tr>
              ))}
              {readyBatches.length === 0 ? (
                <tr>
                  <td colSpan={5}>Nenhuma peça pronta encontrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <article className="card dashboard-panel accent-orange span-4">
          <p className="eyebrow">Alertas críticos</p>
          <h2>Entradas e saídas de materiais</h2>
          <div className="split-list dashboard-movement-list">
            {stockMovements.slice(0, 8).map((movement) => {
              const isEntry = entryMovements.some((entry) => entry.id === movement.id);
              const warehouse = isEntry ? movement.targetWarehouse?.name : movement.originWarehouse?.name;

              return (
                <div className="split-row" key={movement.id}>
                  <div>
                    <strong>{movement.item.description}</strong>
                    <div className="metric-sub">
                      {movementLabels[movement.type] || movement.type} • {warehouse || "Sem depósito"}
                    </div>
                  </div>
                  <span className={isEntry ? "badge green" : "badge orange"}>
                    {isEntry ? "+" : "-"} {formatQuantity(movement.quantity)} {movement.item.unit.code}
                  </span>
                </div>
              );
            })}
            {stockMovements.length === 0 ? <p className="metric-sub">Nenhuma movimentação de material registrada.</p> : null}
          </div>
          <div className="dashboard-balance-line">
            <span><Boxes size={16} /> Entradas: {entryMovements.length}</span>
            <span>Saídas: {exitMovements.length}</span>
          </div>
        </article>

        <section className="table-shell dashboard-panel span-6">
          <div className="table-header">
            <div>
              <p className="eyebrow">Recebimentos financeiros</p>
              <h2>Últimas entradas</h2>
            </div>
            <WalletCards size={22} color="#1b6b45" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {accountReceipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="mono">{receipt.receiptDate.toLocaleDateString("pt-BR")}</td>
                  <td>{receipt.accountReceivable.customer.name}</td>
                  <td className="mono">{receipt.accountReceivable.documentNumber || receipt.accountReceivable.number}</td>
                  <td className="mono">{formatCurrency(receipt.amount)}</td>
                </tr>
              ))}
              {accountReceipts.length === 0 ? (
                <tr>
                  <td colSpan={4}>Nenhum recebimento registrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="table-shell dashboard-panel span-6">
          <div className="table-header">
            <div>
              <p className="eyebrow">Saídas financeiras</p>
              <h2>Últimos pagamentos</h2>
            </div>
            <CheckCircle2 size={22} color="#ff6f00" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Documento</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {accountPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="mono">{payment.paymentDate.toLocaleDateString("pt-BR")}</td>
                  <td>{payment.accountPayable.supplier.name}</td>
                  <td className="mono">{payment.accountPayable.documentNumber || payment.accountPayable.number}</td>
                  <td className="mono">{formatCurrency(payment.amount)}</td>
                </tr>
              ))}
              {accountPayments.length === 0 ? (
                <tr>
                  <td colSpan={4}>Nenhuma saída financeira registrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
