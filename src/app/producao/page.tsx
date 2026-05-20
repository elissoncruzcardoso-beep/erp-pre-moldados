import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Factory,
  Hammer,
  ShieldCheck,
  ThermometerSun
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
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
    redirect("/diretoria");
  }

  const prisma = getPrisma();
  const [orders, products, molds, compositions, notes] = await Promise.all([
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
    })
  ]);

  const activeOrders = orders.filter((order) => !["ENCERRADA", "CANCELADA"].includes(order.status)).length;
  const plannedQuantity = orders.reduce((total, order) => total + decimalToNumber(order.plannedQuantity), 0);
  const producedQuantity = orders.reduce((total, order) => total + decimalToNumber(order.producedQuantity), 0);
  const productionPercent = plannedQuantity > 0 ? Math.round((producedQuantity / plannedQuantity) * 100) : 0;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Controle de producao</p>
          <h1>Ordens de producao reais</h1>
          <p className="lead">
            Cadastro e acompanhamento de OPs conectados ao Supabase. Cada nova ordem cria etapas
            padrao para acompanhar preparacao, armacao, concretagem, cura e liberacao.
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
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">OPs ativas</span><Factory size={22} /></div>
          <strong className="metric-value">{activeOrders}</strong>
          <span className="metric-sub">Planejadas, liberadas ou em producao</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Pecas previstas</span><Hammer size={22} /></div>
          <strong className="metric-value">{plannedQuantity.toLocaleString("pt-BR")}</strong>
          <span className="metric-sub">Quantidade planejada total</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Produzido</span><CalendarClock size={22} /></div>
          <strong className="metric-value">{productionPercent}%</strong>
          <span className="metric-sub">Apontamento contra planejado</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Moldes ativos</span><ThermometerSun size={22} /></div>
          <strong className="metric-value">{molds.length}</strong>
          <span className="metric-sub">Recursos disponiveis para programacao</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
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
