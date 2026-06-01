import Link from "next/link";
import { AccountPayableStatus, AccountReceivableStatus, Prisma, ProductionBatchStatus, StockMovementType } from "@prisma/client";
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
import { hasPermission, requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { activeAccountReceiptWhere, findRecentActiveAccountReceipts } from "@/lib/finance/queries";
import { decimalToNumber, formatMoney, formatQuantity } from "@/lib/formatters";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";

export const dynamic = "force-dynamic";

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

const entryMovementTypes = new Set<StockMovementType>([
  StockMovementType.ENTRADA_COMPRA,
  StockMovementType.ENTRADA_PRODUCAO,
  StockMovementType.AJUSTE_POSITIVO
]);

export default async function DashboardPage() {
  const session = await requirePageSession({ nextPath: "/dashboard", permission: "dashboard.view" });

  const prisma = getPrisma();
  if (hasPermission(session, "producao.manage")) {
    await autoReleaseCuredBatches({ userId: session.userId });
  }

  const curingBatchWhere: Prisma.ProductionBatchWhereInput = {
    status: { in: [ProductionBatchStatus.EM_CURA, ProductionBatchStatus.RETIRADA_PARCIAL] }
  };
  const readyBatchWhere: Prisma.ProductionBatchWhereInput = {
    status: ProductionBatchStatus.APTA_RETIRADA
  };
  const openReceivablesWhere: Prisma.AccountReceivableWhereInput = {
    status: { in: [AccountReceivableStatus.ABERTO, AccountReceivableStatus.FATURADO] }
  };
  const openPayablesWhere: Prisma.AccountPayableWhereInput = {
    status: { in: [AccountPayableStatus.ABERTO, AccountPayableStatus.PROGRAMADO] }
  };
  const entryMovementWhere: Prisma.StockMovementWhereInput = {
    type: {
      in: [StockMovementType.ENTRADA_COMPRA, StockMovementType.ENTRADA_PRODUCAO, StockMovementType.AJUSTE_POSITIVO]
    }
  };
  const exitMovementWhere: Prisma.StockMovementWhereInput = {
    type: {
      in: [StockMovementType.SAIDA_PRODUCAO, StockMovementType.AJUSTE_NEGATIVO, StockMovementType.RESERVA]
    }
  };

  const [
    curingBatchStats,
    readyBatchStats,
    recentCuringBatches,
    recentReadyBatches,
    accountReceipts,
    accountPayments,
    receivableStats,
    payableStats,
    receiptStats,
    paymentStats,
    stockMovements,
    entryMovementCount,
    exitMovementCount
  ] =
    await Promise.all([
      prisma.productionBatch.aggregate({
        where: curingBatchWhere,
        _count: { _all: true },
        _sum: { curingQuantity: true }
      }),
      prisma.productionBatch.aggregate({
        where: readyBatchWhere,
        _count: { _all: true },
        _sum: { releasedQuantity: true }
      }),
      prisma.productionBatch.findMany({
        where: curingBatchWhere,
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
        take: 8
      }),
      prisma.productionBatch.findMany({
        where: readyBatchWhere,
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
        take: 12
      }),
      findRecentActiveAccountReceipts(prisma, 8),
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
      prisma.accountReceivable.aggregate({
        where: openReceivablesWhere,
        _sum: { amount: true, receivedAmount: true }
      }),
      prisma.accountPayable.aggregate({
        where: openPayablesWhere,
        _sum: { amount: true, paidAmount: true }
      }),
      prisma.accountReceipt.aggregate({
        where: activeAccountReceiptWhere(),
        _sum: { amount: true }
      }),
      prisma.accountPayment.aggregate({
        _sum: { amount: true }
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
      }),
      prisma.stockMovement.count({ where: entryMovementWhere }),
      prisma.stockMovement.count({ where: exitMovementWhere })
    ]);

  const receiptTotal = decimalToNumber(receiptStats._sum.amount);
  const paymentTotal = decimalToNumber(paymentStats._sum.amount);
  const openReceivableTotal = Math.max(
    decimalToNumber(receivableStats._sum.amount) - decimalToNumber(receivableStats._sum.receivedAmount),
    0
  );
  const openPayableTotal = Math.max(
    decimalToNumber(payableStats._sum.amount) - decimalToNumber(payableStats._sum.paidAmount),
    0
  );
  const readyQuantity = decimalToNumber(readyBatchStats._sum.releasedQuantity);
  const curingQuantity = decimalToNumber(curingBatchStats._sum.curingQuantity);

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
          <strong className="metric-value">{curingBatchStats._count._all}</strong>
          <span className="metric-sub">{formatQuantity(curingQuantity)} peças em controle de cura/qualidade</span>
          <details className="dashboard-details">
            <summary>
              <Link href="/producao/pecas-em-cura?status=cura">Abrir página</Link>
            </summary>
            <div className="mini-list">
              {recentCuringBatches.map((batch) => (
                <Link href="/producao/pecas-em-cura" className="mini-list-row" key={batch.id}>
                  <span>
                    <strong>{batch.code}</strong>
                    <small>{batch.item.description}</small>
                  </span>
                  <span className="badge blue">{formatQuantity(batch.curingQuantity)} {batch.item.unit.code}</span>
                </Link>
              ))}
              {recentCuringBatches.length === 0 ? <p className="metric-sub">Nenhuma peça em cura neste momento.</p> : null}
            </div>
          </details>
        </article>

        <article className="metric-card futuristic-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Aptas à retirada</span>
            <PackageCheck size={22} />
          </div>
          <strong className="metric-value">{readyBatchStats._count._all}</strong>
          <span className="metric-sub">{formatQuantity(readyQuantity)} peças prontas em lista</span>
          <details className="dashboard-details">
            <summary>
              <Link href="/producao/pecas-em-cura?status=apta">Abrir página</Link>
            </summary>
            <div className="mini-list">
              {recentReadyBatches.map((batch) => (
                <Link href="/producao/pecas-em-cura" className="mini-list-row" key={batch.id}>
                  <span>
                    <strong>{batch.code}</strong>
                    <small>{batch.item.description}</small>
                  </span>
                  <span className="badge green">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</span>
                </Link>
              ))}
              {recentReadyBatches.length === 0 ? <p className="metric-sub">Nenhuma peça apta para retirada.</p> : null}
            </div>
          </details>
        </article>

        <article className="metric-card futuristic-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Recebimentos</span>
            <ArrowDownLeft size={22} />
          </div>
          <strong className="metric-value">{formatMoney(receiptTotal)}</strong>
          <span className="metric-sub">{formatMoney(openReceivableTotal)} em aberto no financeiro</span>
          <Link href="/financeiro" className="secondary-button mini-button">Ver financeiro</Link>
        </article>

        <article className="metric-card futuristic-card accent-orange span-3">
          <div className="metric-top">
            <span className="mono">Saídas financeiras</span>
            <ArrowUpRight size={22} />
          </div>
          <strong className="metric-value">{formatMoney(paymentTotal)}</strong>
          <span className="metric-sub">{formatMoney(openPayableTotal)} a pagar programado/aberto</span>
          <Link href="/financeiro" className="secondary-button mini-button">Ver pagamentos</Link>
        </article>

        <section className="table-shell dashboard-panel span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Atividades recentes</p>
              <h2>Peças prontas em lista</h2>
            </div>
            <span className="badge green">{readyBatchStats._count._all} lotes</span>
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
              {recentReadyBatches.map((batch) => (
                <tr key={batch.id}>
                  <td className="mono">{batch.code}</td>
                  <td>{batch.item.description}</td>
                  <td className="mono">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</td>
                  <td className="mono">{batch.producedAt.toLocaleDateString("pt-BR")}</td>
                  <td><span className="badge green">{batchStatusLabels[batch.status] || batch.status}</span></td>
                </tr>
              ))}
              {recentReadyBatches.length === 0 ? (
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
              const isEntry = entryMovementTypes.has(movement.type);
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
            <span><Boxes size={16} /> Entradas: {entryMovementCount}</span>
            <span>Saídas: {exitMovementCount}</span>
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
                  <td className="mono">{formatMoney(receipt.amount)}</td>
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
                  <td className="mono">{formatMoney(payment.amount)}</td>
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

