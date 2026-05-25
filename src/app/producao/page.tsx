import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  ClipboardEdit,
  ClipboardList,
  Factory,
  Hammer,
  Hourglass,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";
import { ProductionNoteForm } from "./production-note-form";
import { ProductionOrderForm } from "./production-order-form";

export const dynamic = "force-dynamic";

const stageColumns = ["Preparacao", "Armacao", "Concretagem", "Cura/Qualidade", "Liberacao"];

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function formatQuantity(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";

  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const statusLabels: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PLANEJADA: "Planejada",
  LIBERADA: "Liberada",
  EM_PRODUCAO: "Em producao",
  PAUSADA: "Pausada",
  AGUARDANDO_QUALIDADE: "Qualidade",
  ENCERRADA: "Encerrada",
  CANCELADA: "Cancelada"
};

export default async function ProducaoPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/producao");
  }

  if (!session.permissions.includes("producao.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  if (session.permissions.includes("producao.manage")) {
    await autoReleaseCuredBatches({ userId: session.userId });
  }

  const [orders, products, molds, compositions, notes, dailyLogs, batches] = await Promise.all([
    prisma.productionOrder.findMany({
      include: {
        product: {
          include: {
            unit: true
          }
        },
        mold: true,
        stages: {
          orderBy: { sequence: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.item.findMany({
      where: {
        active: true,
        type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
      },
      include: {
        unit: true
      },
      orderBy: { code: "asc" }
    }),
    prisma.mold.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.composition.findMany({
      include: {
        product: true
      },
      where: {
        approved: true
      },
      orderBy: { code: "asc" }
    }),
    prisma.productionNote.findMany({
      include: {
        productionOrder: {
          include: {
            product: {
              include: {
                unit: true
              }
            }
          }
        },
        user: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.productionDailyLog.findMany({
      include: {
        items: {
          include: {
            item: {
              include: {
                unit: true
              }
            }
          }
        }
      },
      orderBy: { logDate: "desc" },
      take: 7
    }),
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
      take: 20
    })
  ]);

  const activeOrders = orders.filter((order) => !["ENCERRADA", "CANCELADA"].includes(order.status)).length;
  const plannedQuantity = orders.reduce((total, order) => total + decimalToNumber(order.plannedQuantity), 0);
  const producedQuantity = orders.reduce((total, order) => total + decimalToNumber(order.producedQuantity), 0);
  const productionPercent = plannedQuantity > 0 ? Math.round((producedQuantity / plannedQuantity) * 100) : 0;
  const producedByDiary = dailyLogs.reduce((sum, log) => {
    return sum + log.items.reduce((itemSum, item) => itemSum + decimalToNumber(item.quantity), 0);
  }, 0);
  const curingBatches = batches.filter((batch) => batch.status === "EM_CURA" || batch.status === "RETIRADA_PARCIAL");
  const readyBatches = batches.filter((batch) => batch.status === "APTA_RETIRADA");
  const curingQuantity = curingBatches.reduce((sum, batch) => sum + decimalToNumber(batch.curingQuantity), 0);
  const readyQuantity = readyBatches.reduce((sum, batch) => sum + decimalToNumber(batch.releasedQuantity), 0);
  const lastLog = dailyLogs[0];
  const lastTeamCount = lastLog
    ? lastLog.teamPresent.split(/,|\n/).map((name) => name.trim()).filter(Boolean).length
    : 0;

  return (
    <>
      <section className="page-head production-hero">
        <div>
          <p className="eyebrow">Controle de producao</p>
          <h1>Chao de fabrica simplificado</h1>
          <p className="lead">
            Fluxo principal do mestre: registrar o Diario, acompanhar lotes em cura e liberar
            pecas aptas para retirada. OPs continuam disponiveis como controle avancado.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
          <Link className="secondary-button" href="/producao/relatorios">
            <BarChart3 size={17} />
            Relatorios
          </Link>
          <Link className="primary-button" href="/producao/diario">
            <ClipboardEdit size={17} />
            Diario
          </Link>
          <Link className="secondary-button" href="/producao/pecas-em-cura">
            <PackageCheck size={17} />
            Pecas em cura
          </Link>
        </div>
      </section>

      <section className="production-action-grid" style={{ marginBottom: 16 }}>
        <Link className="production-action-card accent-blue" href="/producao/diario">
          <ClipboardEdit size={26} />
          <div>
            <strong>Registrar Diario</strong>
            <span>Equipe, clima, pecas produzidas e observacoes do dia.</span>
          </div>
        </Link>
        <Link className="production-action-card accent-orange" href="/producao/pecas-em-cura">
          <Hourglass size={26} />
          <div>
            <strong>Pecas em Cura</strong>
            <span>Liberar lotes para retirada depois da conferencia.</span>
          </div>
        </Link>
        <Link className="production-action-card accent-gray" href="/dashboard">
          <Sparkles size={26} />
          <div>
            <strong>Ver Dashboard</strong>
            <span>Acompanhar cura, retirada, financeiro e movimentacoes.</span>
          </div>
        </Link>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Diarios</span><ClipboardList size={22} /></div>
          <strong className="metric-value">{dailyLogs.length}</strong>
          <span className="metric-sub">Registros recentes do chao de fabrica</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Em cura</span><Hourglass size={22} /></div>
          <strong className="metric-value">{formatQuantity(curingQuantity)}</strong>
          <span className="metric-sub">{curingBatches.length} lotes aguardando liberacao</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Aptas retirada</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{formatQuantity(readyQuantity)}</strong>
          <span className="metric-sub">{readyBatches.length} lotes liberados</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Equipe ultimo dia</span><Users size={22} /></div>
          <strong className="metric-value">{lastTeamCount}</strong>
          <span className="metric-sub">{formatQuantity(producedByDiary)} pecas nos diarios listados</span>
        </article>
      </section>

      <section className="grid-12 production-overview-grid" style={{ marginBottom: 16 }}>
        <section className="table-shell production-lot-panel span-12">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lotes recentes</p>
              <h2>Cura e retirada</h2>
            </div>
            <span className="badge blue">{batches.length} lotes</span>
          </div>
          <div className="production-lot-list">
            <div className="production-lot-row production-lot-head">
              <span>Lote</span>
              <span>Peça</span>
              <span>Produção</span>
              <span>Cura</span>
              <span>Status</span>
            </div>
            {batches.map((batch) => (
              <article className="production-lot-row" key={batch.id}>
                <div>
                  <strong className="mono">{batch.code}</strong>
                  <span className="metric-sub mono">{batch.producedAt.toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="production-lot-product">
                  <strong>{batch.item.description}</strong>
                  <span className="metric-sub">{batch.item.code}</span>
                </div>
                <div className="production-lot-numbers">
                  <span>Em cura <strong>{formatQuantity(batch.curingQuantity)} {batch.item.unit.code}</strong></span>
                  <span>Liberado <strong>{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</strong></span>
                </div>
                <div>
                  <span className="metric-sub">Apto em</span>
                  <strong className="mono">{formatDateTime(batch.readyAt)}</strong>
                </div>
                <div className="production-lot-status">
                  <span className={batch.status === "APTA_RETIRADA" ? "badge green" : "badge orange"}>
                    {batch.status === "APTA_RETIRADA" ? "Apta retirada" : "Em cura"}
                  </span>
                </div>
              </article>
            ))}
            {batches.length === 0 ? (
              <p className="empty-state">Nenhum lote gerado ainda. Lance um Diario de Producao.</p>
            ) : null}
          </div>
        </section>

        <aside className="production-summary-row span-12">
          <section className="card accent-blue product-side-panel">
            <p className="eyebrow">Ultimo diario</p>
            <h2>{lastLog ? lastLog.logDate.toLocaleDateString("pt-BR") : "Sem diario"}</h2>
            {lastLog ? (
              <div className="split-list">
                <div className="split-row">
                  <span>Clima</span>
                  <strong>{lastLog.weatherMorning} / {lastLog.weatherAfternoon}</strong>
                </div>
                <div className="split-row">
                  <span>Equipe</span>
                  <strong className="mono">{lastTeamCount}</strong>
                </div>
                {lastLog.items.map((item) => (
                  <div className="split-row" key={item.id}>
                    <span>{item.item.description}</span>
                    <strong className="mono">{formatQuantity(item.quantity)} {item.item.unit.code}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="metric-sub">Ainda nao existe diario registrado.</p>
            )}
          </section>

          <section className="card accent-orange product-side-panel">
            <p className="eyebrow">Controle avancado</p>
            <h2>OPs continuam disponiveis</h2>
            <div className="split-list">
              <div className="split-row"><span>OPs ativas</span><strong className="mono">{activeOrders}</strong></div>
              <div className="split-row"><span>Pecas previstas</span><strong className="mono">{formatQuantity(plannedQuantity)}</strong></div>
              <div className="split-row"><span>Apontado em OP</span><strong className="mono">{productionPercent}%</strong></div>
              <div className="split-row"><span>Moldes ativos</span><strong className="mono">{molds.length}</strong></div>
            </div>
          </section>
        </aside>
      </section>

      <details className="advanced-production-block">
        <summary>Controle avancado por OP</summary>
        <section className="grid-12" style={{ marginTop: 16 }}>
          <section className="stage-board span-8">
            {stageColumns.map((stageName) => {
              const stageCards = orders.filter((order) => {
                const activeStage = order.stages.find((stage) => stage.status === "EM_ANDAMENTO") || order.stages[0];
                return activeStage?.name === stageName;
              });

              return (
                <article className="stage-column" key={stageName}>
                  <div className="stage-title">
                    <h3>{stageName}</h3>
                    <span className="badge blue">{stageCards.length} OPs</span>
                  </div>
                  <div className="stage-list">
                    {stageCards.map((order) => {
                      const planned = decimalToNumber(order.plannedQuantity);
                      const produced = decimalToNumber(order.producedQuantity);
                      const progress = planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
                      const expected = order.expectedDate ? order.expectedDate.toLocaleDateString("pt-BR") : "Sem data";

                      return (
                        <div className="lot-card" key={order.id}>
                          <div className="lot-meta">
                            <span>{order.number}</span>
                            <span>{expected}</span>
                          </div>
                          <h3>{order.product.description}</h3>
                          <div className="lot-tags">
                            <span className="badge">{order.mold?.code || "Sem molde"}</span>
                            <span className="badge orange">{statusLabels[order.status] || order.status}</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill warning" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {stageCards.length === 0 ? <span className="metric-sub">Sem OP nesta etapa.</span> : null}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="product-side-stack span-4">
          <section className="card accent-blue product-side-panel">
            <p className="eyebrow">Nova OP</p>
            <h2>Criar ordem</h2>
            <ProductionOrderForm
              products={products.map((product) => ({
                id: product.id,
                label: `${product.code} - ${product.description} (${product.unit.code})`
              }))}
              molds={molds.map((mold) => ({
                id: mold.id,
                label: `${mold.code} - ${mold.name}`
              }))}
              compositions={compositions.map((composition) => ({
                id: composition.id,
                productId: composition.productId,
                label: `${composition.code} v${composition.version} - ${composition.product.description}`
              }))}
            />
          </section>

          <section className="card accent-orange product-side-panel">
            <p className="eyebrow">Apontamento</p>
            <h2>Registrar producao</h2>
            <ProductionNoteForm
              orders={orders
                .filter((order) => !["ENCERRADA", "CANCELADA"].includes(order.status))
                .map((order) => ({
                  id: order.id,
                  number: order.number,
                  product: order.product.description,
                  stages: order.stages.map((stage) => stage.name)
                }))}
            />
          </section>
          </aside>
        </section>
      </details>

      <section className="table-shell" style={{ marginTop: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Programacao</p>
            <h2>Ordens cadastradas</h2>
          </div>
          <Factory size={22} color="#1a237e" />
        </div>
        <table>
          <thead>
            <tr>
              <th>OP</th>
              <th>Produto</th>
              <th>Qtd. planejada</th>
              <th>Qtd. produzida</th>
              <th>Molde</th>
              <th>Status</th>
              <th>Entrega</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="mono">{order.number}</td>
                <td>{order.product.description}</td>
                <td className="mono">{decimalToNumber(order.plannedQuantity).toLocaleString("pt-BR")} {order.product.unit.code}</td>
                <td className="mono">{decimalToNumber(order.producedQuantity).toLocaleString("pt-BR")} {order.product.unit.code}</td>
                <td>{order.mold?.code || "-"}</td>
                <td><span className="badge blue">{statusLabels[order.status] || order.status}</span></td>
                <td>{order.expectedDate ? order.expectedDate.toLocaleDateString("pt-BR") : "-"}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhuma ordem de producao criada ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginTop: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Apontamentos</p>
            <h2>Ultimos registros de producao</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>OP</th>
              <th>Etapa</th>
              <th>Produzido</th>
              <th>Perda</th>
              <th>Sucata</th>
              <th>Parada</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr key={note.id}>
                <td className="mono">{note.createdAt.toLocaleString("pt-BR")}</td>
                <td className="mono">{note.productionOrder.number}</td>
                <td>{note.stage}</td>
                <td className="mono">
                  {decimalToNumber(note.producedQuantity).toLocaleString("pt-BR")} {note.productionOrder.product.unit.code}
                </td>
                <td className="mono">
                  {decimalToNumber(note.lossQuantity).toLocaleString("pt-BR")} {note.productionOrder.product.unit.code}
                </td>
                <td className="mono">
                  {decimalToNumber(note.scrapQuantity).toLocaleString("pt-BR")} {note.productionOrder.product.unit.code}
                </td>
                <td className="mono">{note.downtimeMinutes} min</td>
                <td>{note.user.name}</td>
              </tr>
            ))}
            {notes.length === 0 ? (
              <tr>
                <td colSpan={8}>Nenhum apontamento registrado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
