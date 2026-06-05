import { redirect } from "next/navigation";
import { Boxes, ClipboardList, Factory, Plus, Ruler, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { PaginationControls } from "@/components/pagination-controls";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatQuantity } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { CompositionActions } from "./composition-actions";

export const dynamic = "force-dynamic";

function decimalToString(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  return String(value ?? "0");
}

type ProdutosPageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function ProdutosPage({ searchParams }: ProdutosPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/produtos");
  }

  if (!session.permissions.includes("produtos.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const params = (await searchParams) || {};
  const compositionPagination = parsePagination(params, {
    pageParam: "fichasPage",
    defaultPageSize: 6,
    maxPageSize: 30
  });
  const rawMaterialWhere = {
    OR: [
      { type: "MATERIA_PRIMA" as const },
      { type: "INSUMO" as const }
    ]
  };

  const [
    totalItems,
    precastCount,
    rawMaterialCount,
    activeCompositions,
    compositionsCount
  ] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: { type: "PECA_PRE_MOLDADA" } }),
    prisma.item.count({ where: rawMaterialWhere }),
    prisma.composition.count({ where: { approved: true } }),
    prisma.composition.count()
  ]);

  const compositionPaginationMeta = getPaginationMeta(compositionsCount, compositionPagination.page, compositionPagination.pageSize);
  const compositionSkip = (compositionPaginationMeta.page - 1) * compositionPagination.pageSize;

  const [
    compositions,
    approvedCapacityCompositions
  ] = await Promise.all([
    prisma.composition.findMany({
      include: {
        product: {
          include: {
            unit: true
          }
        },
        items: {
          include: {
            item: {
              include: {
                unit: true,
                stockBalances: true
              }
            }
          },
          orderBy: { stage: "asc" }
        },
        orders: true
      },
      orderBy: { code: "asc" },
      skip: compositionSkip,
      take: compositionPagination.pageSize
    }),
    prisma.composition.findMany({
      where: {
        approved: true,
        product: {
          active: true
        }
      },
      include: {
        product: {
          include: {
            unit: true
          }
        },
        items: {
          include: {
            item: {
              include: {
                unit: true,
                stockBalances: true
              }
            }
          },
          orderBy: { stage: "asc" }
        },
        orders: true
      },
      orderBy: { code: "asc" }
    })
  ]);

  const calculateCompositionCapacity = (
    composition: (typeof compositions)[number] | (typeof approvedCapacityCompositions)[number]
  ) => {
    const baseQuantity = decimalToNumber(composition.baseQuantity) || 1;
    const items = composition.items.map((compositionItem) => {
      const quantity = decimalToNumber(compositionItem.quantity);
      const lossPercent = decimalToNumber(compositionItem.lossPercent);
      const required = quantity * (1 + lossPercent / 100);
      const available = compositionItem.item.stockBalances.reduce((sum, balance) => {
        const availableBalance = decimalToNumber(balance.quantity) - decimalToNumber(balance.reserved);

        return sum + Math.max(availableBalance, 0);
      }, 0);
      const capacity = required > 0 ? Math.floor(available / required) : 0;

      return {
        code: compositionItem.item.code,
        description: compositionItem.item.description,
        unit: compositionItem.item.unit.code,
        available,
        capacity
      };
    });
    const limitingItem = items.reduce<(typeof items)[number] | null>((lowest, item) => {
      if (!lowest) {
        return item;
      }

      return item.capacity < lowest.capacity ? item : lowest;
    }, null);

    return {
      id: composition.id,
      code: composition.code,
      productCode: composition.product.code,
      product: composition.product.description,
      unit: composition.product.unit.code,
      approved: composition.approved,
      itemsCount: items.length,
      limitingItem,
      capacity: limitingItem ? Math.floor(limitingItem.capacity * baseQuantity) : null
    };
  };

  const compositionCapacity = compositions.map(calculateCompositionCapacity);
  const productionCapacity = approvedCapacityCompositions.map(calculateCompositionCapacity);
  const bestProductionCapacity = productionCapacity.reduce<(typeof productionCapacity)[number] | null>((best, item) => {
    if (!best) {
      return item;
    }

    return (item.capacity ?? 0) > (best.capacity ?? 0) ? item : best;
  }, null);
  const productiveCapacityCount = productionCapacity.filter((item) => (item.capacity ?? 0) > 0).length;
  const blockedCapacityCount = productionCapacity.filter((item) => (item.capacity ?? 0) <= 0).length;
  const compositionCapacityById = new Map(compositionCapacity.map((item) => [item.id, item]));

  const formatCapacity = (capacity: number | null) => {
    if (capacity === null) {
      return "-";
    }

    return `${formatQuantity(capacity)} un`;
  };

  const getCapacityBadgeClass = (capacity: number | null) => {
    if (capacity === null) {
      return "badge";
    }

    return capacity > 0 ? "badge green" : "badge red";
  };

  const getCapacityBadgeLabel = (capacity: number | null) => {
    if (capacity === null) {
      return "Sem insumos";
    }

    return capacity > 0 ? "Pode produzir" : "Sem saldo";
  };

  return (
    <>
      <section className="product-hero-panel">
        <div>
          <p className="eyebrow">Produtos e ficha técnica</p>
          <h1>Produtos e ficha técnica</h1>
          <p className="lead">
            Cadastro técnico de peças, insumos e composições para estimar produção, controlar estoque e orientar a fábrica.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
          <a className="secondary-button" href="/cadastros/produtos">
            <Plus size={17} />
            Cadastrar produto
          </a>
          <a className="primary-button" href="/produtos/composicoes/nova">
            <ClipboardList size={17} />
            Nova ficha
          </a>
        </div>
      </section>

      <section className="product-metric-grid">
        <article className="product-metric-card accent-blue">
          <div className="metric-top">
            <span className="mono">Itens cadastrados</span>
            <Boxes size={22} />
          </div>
          <strong className="metric-value">{totalItems}</strong>
          <span className="metric-sub">Produtos, peças, insumos e matérias-primas.</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top">
            <span className="mono">Peças pré-moldadas</span>
            <Factory size={22} />
          </div>
          <strong className="metric-value">{precastCount}</strong>
          <span className="metric-sub">Lista real das peças fabricadas pela equipe.</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top">
            <span className="mono">Insumos base</span>
            <ClipboardList size={22} />
          </div>
          <strong className="metric-value">{rawMaterialCount}</strong>
          <span className="metric-sub">Materiais usados nas composições.</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top">
            <span className="mono">Fichas aprovadas</span>
            <Ruler size={22} />
          </div>
          <strong className="metric-value">{activeCompositions}</strong>
          <span className="metric-sub">Composições liberadas para uso.</span>
        </article>
      </section>

      <section className="product-page-stack">
        <section className="product-section-card production-capacity-panel">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Capacidade produtiva</p>
              <h2>Quanto conseguimos produzir com o estoque atual</h2>
              <p className="metric-sub">
                Estimativa calculada pelas fichas técnicas aprovadas e pelo saldo disponível dos insumos.
              </p>
            </div>
            <span className="badge blue">Capacidade por ficha</span>
          </div>
          <div className="capacity-summary-grid">
            <article>
              <span className="mono">Maior capacidade individual</span>
              <strong>{formatCapacity(bestProductionCapacity?.capacity ?? null)}</strong>
              <small>{bestProductionCapacity?.product ?? "Nenhuma ficha aprovada."}</small>
            </article>
            <article>
              <span className="mono">Fichas analisadas</span>
              <strong>{productionCapacity.length}</strong>
              <small>Somente fichas aprovadas de produtos ativos.</small>
            </article>
            <article>
              <span className="mono">Com saldo para produzir</span>
              <strong>{productiveCapacityCount}</strong>
              <small>Fichas com capacidade individual maior que zero.</small>
            </article>
            <article>
              <span className="mono">Sem saldo suficiente</span>
              <strong>{blockedCapacityCount}</strong>
              <small>Peças bloqueadas pelo menor estoque de insumo.</small>
            </article>
          </div>

          <div className="capacity-card-grid">
            {productionCapacity.map((item) => (
              <article className="capacity-card" key={item.id}>
                <div className="capacity-card-head">
                  <span className="mono">{item.code}</span>
                  <span className={getCapacityBadgeClass(item.capacity)}>
                    {getCapacityBadgeLabel(item.capacity)}
                  </span>
                </div>
                <h3>{item.product}</h3>
                <div className="product-card-meta">
                  <span>Produto: {item.productCode}</span>
                  <span>Insumos: {item.itemsCount}</span>
                  <span>Limitante: {item.limitingItem?.code ?? "-"}</span>
                </div>
                <div className="lot-tags">
                  <span className="badge blue">Produção possível: {formatCapacity(item.capacity)}</span>
                  <span className="badge">Saldo limitante: {item.limitingItem ? `${formatQuantity(item.limitingItem.available)} ${item.limitingItem.unit}` : "-"}</span>
                </div>
              </article>
            ))}
            {productionCapacity.length === 0 ? (
              <p className="metric-sub">Nenhuma ficha técnica aprovada para calcular capacidade produtiva.</p>
            ) : null}
          </div>
        </section>

        <section className="product-section-card">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Composicoes</p>
              <h2>Fichas tecnicas de producao</h2>
            </div>
            <div className="button-row">
              <span className="badge orange">{compositionsCount} fichas</span>
              <a className="primary-button mini-button" href="/produtos/composicoes/nova">
                <ClipboardList size={14} />
                Nova composição
              </a>
            </div>
          </div>
          <div className="composition-record-stack">
            {compositions.map((composition) => (
              <article className="composition-record-card" key={composition.id}>
                <div className="composition-record-main">
                  <div className="supply-record-title">
                    <div>
                      <p className="eyebrow">Ficha tecnica</p>
                      <h3 className="mono">{composition.code}</h3>
                      <span className="metric-sub">{composition.product.code} - {composition.product.description}</span>
                    </div>
                    <div className="supplier-quote-badges">
                      <span className={composition.approved ? "badge green" : "badge orange"}>
                        {composition.approved ? "Aprovada" : "Em revisao"}
                      </span>
                      <span className="badge">{composition.orders.length} OP</span>
                    </div>
                  </div>

                  <div className="quote-meta-grid">
                    <div>
                      <span>Versao</span>
                      <strong>{composition.version} / {composition.revision}</strong>
                    </div>
                    <div>
                      <span>Base</span>
                      <strong>{decimalToString(composition.baseQuantity)} {composition.product.unit.code}</strong>
                    </div>
                    <div>
                      <span>Perda</span>
                      <strong>{decimalToString(composition.expectedLoss)}%</strong>
                    </div>
                    <div>
                      <span>Cura</span>
                      <strong>{composition.curingHours ?? composition.product.curingHours}h</strong>
                    </div>
                  </div>

                  <div className="quote-items-table composition-items-table">
                    <div className="composition-items-row composition-items-head">
                      <span>Insumo</span>
                      <span>Qtd.</span>
                      <span>Perda</span>
                      <span>Etapa</span>
                      <span>Saldo</span>
                    </div>
                    {composition.items.map((compositionItem) => (
                      <div className="composition-items-row" key={compositionItem.id}>
                        <div>
                          <strong>{compositionItem.item.code}</strong>
                          <small>{compositionItem.item.description}</small>
                        </div>
                        <strong className="mono">{decimalToString(compositionItem.quantity)} {compositionItem.item.unit.code}</strong>
                        <span className="mono">{decimalToString(compositionItem.lossPercent)}%</span>
                        <span>{compositionItem.stage || "Sem etapa"}</span>
                        <span className="mono">
                          {formatQuantity(compositionItem.item.stockBalances.reduce((total, balance) => total + decimalToNumber(balance.quantity), 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="supply-record-actions">
                  <div className="quote-total-box">
                    <span>Capacidade estimada</span>
                    <strong>{formatCapacity(compositionCapacityById.get(composition.id)?.capacity ?? null)}</strong>
                    <small>Limitada pelo menor saldo de insumo</small>
                  </div>
                  <CompositionActions
                    compositionId={composition.id}
                    locked={composition.orders.length > 0}
                    editData={{
                      code: composition.code
                    }}
                  />
                </aside>
              </article>
            ))}
            {compositions.length === 0 ? (
              <p className="metric-sub">Nenhuma ficha tecnica cadastrada ainda.</p>
            ) : null}
          </div>
          <PaginationControls
            pathname="/produtos"
            params={params}
            meta={compositionPaginationMeta}
            pageParam="fichasPage"
          />
        </section>
      </section>
    </>
  );
}
