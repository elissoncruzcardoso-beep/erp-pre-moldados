import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  Factory,
  FileDown,
  Filter,
  Gauge,
  Hourglass,
  PackageCheck,
  TimerReset,
  Users
} from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { PrototypeAction } from "@/components/prototype-action";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatMoney, formatQuantity } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { ProductionExternalReport } from "./production-external-report";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  if (status === "APTA_RETIRADA" || status === "ENCERRADA") return "badge green";
  if (status === "BLOQUEADA" || status === "CANCELADA" || status === "ATRASADA") return "badge red";
  if (status === "EM_CURA" || status === "RETIRADA_PARCIAL" || status === "PAUSADA") return "badge orange";
  return "badge blue";
}

const reportEnvironments = [
  {
    title: "Produtividade",
    description: "Diarios, equipe presente, pecas produzidas e resumo por produto.",
    icon: BarChart3,
    items: ["Producao diaria", "Resumo por equipe", "Pecas por produto", "Liberadas para retirada"]
  },
  {
    title: "Lotes e cura",
    description: "Acompanhamento de lotes em cura, aptos para retirada e retirados.",
    icon: Hourglass,
    items: ["Pecas em cura", "Aptas retirada", "Retirada parcial", "Lotes bloqueados"]
  },
  {
    title: "Ordens de producao",
    description: "Controle avancado de OPs, status, atraso e etapas de fabrica.",
    icon: Factory,
    items: ["OPs abertas", "OPs encerradas", "Fila por etapa", "Atrasos"]
  },
  {
    title: "Consumo e estoque",
    description: "Base para cruzar composicao prevista, consumo e entrada de peca pronta.",
    icon: Boxes,
    items: ["Previsto x realizado", "Movimentos de material", "Entrada de peca", "Custo por OP"]
  }
];

type ProducaoRelatoriosPageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function ProducaoRelatoriosPage({ searchParams }: ProducaoRelatoriosPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/producao/relatorios");
  }

  if (!session.permissions.includes("producao.view")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) || {};
  const batchPagination = parsePagination(params, {
    pageParam: "lotesPage",
    defaultPageSize: 12,
    maxPageSize: 60
  });
  const orderPagination = parsePagination(params, {
    pageParam: "opsPage",
    defaultPageSize: 10,
    maxPageSize: 60
  });
  const prisma = getPrisma();
  const [orders, notes, dailyLogs, batches, stockMovements, products, orderCount, batchCount] = await Promise.all([
    prisma.productionOrder.findMany({
      include: {
        product: { include: { unit: true } },
        composition: true,
        stages: { orderBy: { sequence: "asc" } }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.productionNote.findMany({
      include: {
        user: true,
        productionOrder: {
          include: {
            product: { include: { unit: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.productionDailyLog.findMany({
      include: {
        createdBy: true,
        items: {
          include: {
            item: { include: { unit: true } }
          }
        }
      },
      orderBy: { logDate: "desc" },
      take: 80
    }),
    prisma.productionBatch.findMany({
      include: {
        item: { include: { unit: true } },
        releasedBy: true,
        dailyLogItem: {
          include: {
            dailyLog: true
          }
        }
      },
      orderBy: [{ producedAt: "desc" }, { code: "desc" }],
      take: 80
    }),
    prisma.stockMovement.findMany({
      where: {
        type: { in: ["SAIDA_PRODUCAO", "ENTRADA_PRODUCAO"] }
      },
      include: {
        item: { include: { unit: true } },
        originWarehouse: true,
        targetWarehouse: true,
        lot: true,
        user: true,
        productionOrder: true
      },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.item.findMany({
      where: {
        active: true,
        type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
      },
      include: { unit: true },
      orderBy: [{ group: "asc" }, { code: "asc" }]
    }),
    prisma.productionOrder.count(),
    prisma.productionBatch.count()
  ]);
  const batchMeta = getPaginationMeta(batches.length, batchPagination.page, batchPagination.pageSize);
  const paginatedBatches = batches.slice(
    (batchMeta.page - 1) * batchMeta.pageSize,
    batchMeta.page * batchMeta.pageSize
  );
  const orderMeta = getPaginationMeta(orders.length, orderPagination.page, orderPagination.pageSize);
  const paginatedOrders = orders.slice(
    (orderMeta.page - 1) * orderMeta.pageSize,
    orderMeta.page * orderMeta.pageSize
  );

  const activeOrders = orders.filter((order) => !["ENCERRADA", "CANCELADA"].includes(order.status)).length;
  const totalDiaryQuantity = dailyLogs.reduce((sum, log) => {
    return sum + log.items.reduce((itemSum, item) => itemSum + decimalToNumber(item.quantity), 0);
  }, 0);
  const curingQuantity = batches
    .filter((batch) => batch.status === "EM_CURA" || batch.status === "RETIRADA_PARCIAL")
    .reduce((sum, batch) => sum + decimalToNumber(batch.curingQuantity), 0);
  const readyQuantity = batches
    .filter((batch) => batch.status === "APTA_RETIRADA")
    .reduce((sum, batch) => sum + decimalToNumber(batch.releasedQuantity), 0);
  const producedInOrders = notes.reduce((sum, note) => sum + decimalToNumber(note.producedQuantity), 0);
  const lossInOrders = notes.reduce((sum, note) => sum + decimalToNumber(note.lossQuantity) + decimalToNumber(note.scrapQuantity), 0);
  const efficiency = producedInOrders + lossInOrders > 0
    ? Math.round((producedInOrders / (producedInOrders + lossInOrders)) * 100)
    : 100;

  const productSummary = new Map<string, { item: string; unit: string; quantity: number; logs: number }>();
  dailyLogs.forEach((log) => {
    log.items.forEach((entry) => {
      const current = productSummary.get(entry.itemId) || {
        item: entry.item.description,
        unit: entry.item.unit.code,
        quantity: 0,
        logs: 0
      };
      current.quantity += decimalToNumber(entry.quantity);
      current.logs += 1;
      productSummary.set(entry.itemId, current);
    });
  });

  const productRows = Array.from(productSummary.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  const timeline = [
    ...dailyLogs.map((log) => ({
      id: `daily-${log.id}`,
      date: log.logDate,
      stage: "Diario",
      document: log.logDate.toLocaleDateString("pt-BR"),
      description: `${log.items.length} item(ns) produzidos`,
      status: "REGISTRADO",
      responsible: log.createdBy.name,
      value: formatQuantity(log.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0))
    })),
    ...batches.map((batch) => ({
      id: `batch-${batch.id}`,
      date: batch.producedAt,
      stage: "Lote",
      document: batch.code,
      description: batch.item.description,
      status: batch.status,
      responsible: batch.releaseResponsible || batch.releasedBy?.name || "Chao de fabrica",
      value: `${formatQuantity(batch.producedQuantity)} ${batch.item.unit.code}`
    })),
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      date: order.createdAt,
      stage: "OP",
      document: order.number,
      description: order.product.description,
      status: order.status,
      responsible: "Producao",
      value: `${formatQuantity(order.producedQuantity)} / ${formatQuantity(order.plannedQuantity)} ${order.product.unit.code}`
    })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      date: note.createdAt,
      stage: "Apontamento",
      document: note.productionOrder.number,
      description: `${note.stage} - ${note.productionOrder.product.description}`,
      status: "APONTADO",
      responsible: note.user.name,
      value: `${formatQuantity(note.producedQuantity)} ${note.productionOrder.product.unit.code}`
    })),
    ...stockMovements.map((movement) => ({
      id: `stock-${movement.id}`,
      date: movement.createdAt,
      stage: "Estoque",
      document: movement.document || movement.productionOrder?.number || "-",
      description: `${movement.type} - ${movement.item.description}`,
      status: movement.type,
      responsible: movement.user.name,
      value: formatMoney(movement.totalCost)
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 120);
  const statusOptions = Array.from(new Set([
    ...orders.map((order) => order.status),
    ...batches.map((batch) => batch.status),
    ...timeline.map((event) => event.status)
  ])).sort();
  const reportData = {
    generatedBy: session.name,
    generatedAt: new Date().toISOString(),
    dailyLogs: dailyLogs.map((log) => ({
      id: log.id,
      logDate: log.logDate.toISOString(),
      teamPresent: log.teamPresent,
      weatherMorning: log.weatherMorning,
      weatherAfternoon: log.weatherAfternoon,
      observation: log.observation || "",
      items: log.items.map((entry) => ({
        id: entry.itemId,
        code: entry.item.code,
        description: entry.item.description,
        quantity: formatQuantity(entry.quantity),
        unit: entry.item.unit.code,
        note: entry.note || ""
      }))
    })),
    batches: batches.map((batch) => ({
      id: batch.id,
      code: batch.code,
      producedAt: batch.producedAt.toISOString(),
      productId: batch.itemId,
      product: batch.item.description,
      producedQuantity: formatQuantity(batch.producedQuantity),
      curingQuantity: formatQuantity(batch.curingQuantity),
      releasedQuantity: formatQuantity(batch.releasedQuantity),
      unit: batch.item.unit.code,
      status: batch.status,
      releasedAt: batch.releasedAt?.toISOString() || "",
      releaseResponsible: batch.releaseResponsible || batch.releasedBy?.name || "",
      releaseNote: batch.releaseNote || ""
    })),
    orders: orders.map((order) => {
      const activeStage = order.stages.find((stage) => stage.status === "EM_ANDAMENTO") || order.stages[0];

      return {
        id: order.id,
        number: order.number,
        productId: order.productId,
        product: order.product.description,
        plannedQuantity: formatQuantity(order.plannedQuantity),
        producedQuantity: formatQuantity(order.producedQuantity),
        unit: order.product.unit.code,
        status: order.status,
        expectedDate: order.expectedDate?.toISOString() || "",
        composition: order.composition?.code || "",
        activeStage: activeStage?.name || ""
      };
    }),
    notes: notes.map((note) => ({
      id: note.id,
      createdAt: note.createdAt.toISOString(),
      orderNumber: note.productionOrder.number,
      productId: note.productionOrder.productId,
      product: note.productionOrder.product.description,
      stage: note.stage,
      producedQuantity: formatQuantity(note.producedQuantity),
      lossQuantity: formatQuantity(note.lossQuantity),
      scrapQuantity: formatQuantity(note.scrapQuantity),
      downtimeMinutes: note.downtimeMinutes,
      user: note.user.name,
      note: note.note || ""
    })),
    stockMovements: stockMovements.map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt.toISOString(),
      type: movement.type,
      item: `${movement.item.code} - ${movement.item.description}`,
      quantity: formatQuantity(movement.quantity),
      unit: movement.item.unit.code,
      warehouse: movement.type === "ENTRADA_PRODUCAO"
        ? movement.targetWarehouse?.code || ""
        : movement.originWarehouse?.code || "",
      lot: movement.lot?.code || "",
      document: movement.document || movement.productionOrder?.number || "",
      totalCost: formatMoney(movement.totalCost),
      responsible: movement.user.name
    })),
    timeline: timeline.map((event) => ({
      id: event.id,
      date: event.date.toISOString(),
      stage: event.stage,
      document: event.document,
      description: event.description,
      status: event.status,
      responsible: event.responsible,
      value: event.value
    })),
    productOptions: products.map((product) => ({
      id: product.id,
      label: `${product.code} - ${product.description}`
    })),
    statusOptions
  };

  return (
    <>
      <section className="product-hero-panel production-report-hero">
        <div>
          <p className="eyebrow">Relatorios de producao</p>
          <h1>Resumo industrial da fabrica</h1>
          <p className="lead">
            Acompanhe diarios, lotes em cura, pecas aptas para retirada, OPs e apontamentos em uma visao pronta para analise.
          </p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/producao">
            <ArrowLeft size={17} />
            Voltar producao
          </Link>
          <a className="primary-button" href="#relatorio-pdf">
            <FileDown size={17} />
            Gerar PDF
          </a>
        </div>
      </section>

      <nav className="module-tabs production-report-tabs" aria-label="Navegacao de producao">
        <Link className="module-tab" href="/producao">Producao</Link>
        <Link className="module-tab" href="/producao/diario">Diario</Link>
        <Link className="module-tab" href="/producao/pecas-em-cura">Pecas em cura</Link>
        <Link className="module-tab active" href="/producao/relatorios">Relatorios</Link>
      </nav>

      <ProductionExternalReport {...reportData} />

      <section className="product-section-card production-report-filters">
        <div className="table-header product-card-header">
          <div>
            <p className="eyebrow">Filtros</p>
            <h2>Parametros do relatorio</h2>
          </div>
          <PrototypeAction className="secondary-button" message="Filtros visuais aplicados. A proxima etapa sera ligar periodo, produto e status na consulta real.">
            <Filter size={17} />
            Filtrar
          </PrototypeAction>
        </div>
        <div className="report-filter-grid">
          <div className="field">
            <span>Periodo</span>
            <div className="input-like">Ultimos 10 diarios</div>
          </div>
          <div className="field">
            <span>Produto</span>
            <div className="input-like">Todas as pecas</div>
          </div>
          <div className="field">
            <span>Status do lote</span>
            <div className="input-like">Todos</div>
          </div>
          <div className="field">
            <span>Responsavel</span>
            <div className="input-like">Todos</div>
          </div>
        </div>
      </section>

      <section className="product-metric-grid production-report-metrics">
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Produzido diario</span><ClipboardList size={22} /></div>
          <strong className="metric-value">{formatQuantity(totalDiaryQuantity)}</strong>
          <span className="metric-sub">{dailyLogs.length} diarios recentes considerados</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Pecas em cura</span><Hourglass size={22} /></div>
          <strong className="metric-value">{formatQuantity(curingQuantity)}</strong>
          <span className="metric-sub">Quantidade ainda aguardando liberacao</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Aptas retirada</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{formatQuantity(readyQuantity)}</strong>
          <span className="metric-sub">Liberadas pelo mestre/responsavel</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">Eficiencia OP</span><Gauge size={22} /></div>
          <strong className="metric-value">{efficiency}%</strong>
          <span className="metric-sub">{activeOrders} OPs ativas no controle avancado</span>
        </article>
      </section>

      <section className="report-environment-grid production-report-environments">
        {reportEnvironments.map((report) => (
          <article className="product-section-card production-report-card" key={report.title}>
            <div className="metric-top">
              <div>
                <p className="eyebrow">{report.title}</p>
                <h2>{report.description}</h2>
              </div>
              <report.icon size={26} />
            </div>
            <div className="report-chip-list">
              {report.items.map((item) => (
                <PrototypeAction
                  key={item}
                  className="report-chip"
                  message={`${item}: ambiente visual pronto. Proxima etapa: colunas configuraveis e exportacao real.`}
                >
                  {item}
                </PrototypeAction>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="production-report-grid">
        <section className="table-shell product-table-shell">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lotes</p>
              <h2>Cura e retirada</h2>
            </div>
            <span className="badge blue">{batchCount} lotes</span>
          </div>
          <div className="table-scroll">
            <table className="technical-items-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Data</th>
                  <th>Peca</th>
                  <th className="number-cell">Em cura</th>
                  <th className="number-cell">Liberado</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="mono">{batch.code}</td>
                    <td className="mono">{batch.producedAt.toLocaleDateString("pt-BR")}</td>
                    <td>{batch.item.description}</td>
                    <td className="mono number-cell">{formatQuantity(batch.curingQuantity)} {batch.item.unit.code}</td>
                    <td className="mono number-cell">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</td>
                    <td><span className={statusBadge(batch.status)}>{batch.status.replaceAll("_", " ")}</span></td>
                  </tr>
                ))}
                {paginatedBatches.length === 0 ? (
                  <tr><td colSpan={6}>Nenhum lote gerado ainda. Lance um Diario de Producao.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pathname="/producao/relatorios"
            params={params}
            meta={batchMeta}
            pageParam="lotesPage"
          />
        </section>

        <aside className="product-section-card production-report-side">
          <p className="eyebrow">Alertas</p>
          <h2>Pontos para acompanhar</h2>
          <div className="split-list">
            <div className="split-row">
              <span>Lotes em cura</span>
              <strong className="mono">{batches.filter((batch) => batch.status === "EM_CURA").length}</strong>
            </div>
            <div className="split-row">
              <span>Retirada parcial</span>
              <strong className="mono">{batches.filter((batch) => batch.status === "RETIRADA_PARCIAL").length}</strong>
            </div>
            <div className="split-row">
              <span>OPs pausadas</span>
              <strong className="mono">{orders.filter((order) => order.status === "PAUSADA").length}</strong>
            </div>
            <div className="split-row">
              <span>Perdas apontadas</span>
              <strong className="mono">{formatQuantity(lossInOrders)}</strong>
            </div>
          </div>
          <div className="report-alert-box">
            <AlertTriangle size={18} />
            <span>Use esta area para priorizar o que o bot deve resumir para a diretoria.</span>
          </div>
        </aside>
      </section>

      <section className="production-report-grid bottom">
        <section className="table-shell product-table-shell">
          <div className="table-header">
            <div>
              <p className="eyebrow">Produtos</p>
              <h2>Producao por peca</h2>
            </div>
            <CalendarDays size={22} color="#1a237e" />
          </div>
          <div className="table-scroll">
            <table className="technical-items-table compact-report-table">
              <thead>
                <tr>
                  <th>Peca</th>
                  <th className="number-cell">Quantidade</th>
                  <th className="number-cell">Registros</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((row) => (
                  <tr key={row.item}>
                    <td>{row.item}</td>
                    <td className="mono number-cell">{formatQuantity(row.quantity)} {row.unit}</td>
                    <td className="mono number-cell">{row.logs}</td>
                  </tr>
                ))}
                {productRows.length === 0 ? (
                  <tr><td colSpan={3}>Nenhuma producao diaria registrada ainda.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-shell product-table-shell">
          <div className="table-header">
            <div>
              <p className="eyebrow">OPs</p>
              <h2>Mapa operacional</h2>
            </div>
            <TimerReset size={22} color="#1a237e" />
            <span className="badge blue">{orderCount} OPs</span>
          </div>
          <div className="table-scroll">
            <table className="technical-items-table compact-report-table">
              <thead>
                <tr>
                  <th>OP</th>
                  <th>Peca</th>
                  <th className="number-cell">Avanco</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const planned = decimalToNumber(order.plannedQuantity);
                  const produced = decimalToNumber(order.producedQuantity);
                  const progress = planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;

                  return (
                    <tr key={order.id}>
                      <td className="mono">{order.number}</td>
                      <td>{order.product.description}</td>
                      <td className="mono number-cell">{progress}%</td>
                      <td><span className={statusBadge(order.status)}>{order.status.replaceAll("_", " ")}</span></td>
                    </tr>
                  );
                })}
                {paginatedOrders.length === 0 ? (
                  <tr><td colSpan={4}>Nenhuma ordem de producao criada ainda.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pathname="/producao/relatorios"
            params={params}
            meta={orderMeta}
            pageParam="opsPage"
          />
        </section>
      </section>
    </>
  );
}
