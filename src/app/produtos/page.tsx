import { redirect } from "next/navigation";
import { Boxes, ClipboardList, Factory, Plus, Ruler, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { CompositionActions } from "./composition-actions";

export const dynamic = "force-dynamic";

function decimalToString(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  return String(value ?? "0");
}

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

export default async function ProdutosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/produtos");
  }

  if (!session.permissions.includes("produtos.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [items, compositions] = await Promise.all([
    prisma.item.findMany({
      include: {
        unit: true,
        stockBalances: true
      },
      orderBy: [{ type: "asc" }, { code: "asc" }]
    }),
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
      orderBy: { code: "asc" }
    })
  ]);

  const precastCount = items.filter((item) => item.type === "PECA_PRE_MOLDADA").length;
  const precastItems = items.filter((item) => item.type === "PECA_PRE_MOLDADA");
  const rawMaterialCount = items.filter((item) => item.type === "MATERIA_PRIMA" || item.type === "INSUMO").length;
  const activeCompositions = compositions.filter((composition) => composition.approved).length;
  const compositionCapacity = compositions.map((composition) => {
    const capacities = composition.items
      .map((compositionItem) => {
        const required = decimalToNumber(compositionItem.quantity);
        const available = compositionItem.item.stockBalances.reduce((sum, balance) => sum + decimalToNumber(balance.quantity), 0);

        return required > 0 ? Math.floor(available / required) : null;
      })
      .filter((capacity): capacity is number => capacity !== null);

    return {
      id: composition.id,
      code: composition.code,
      product: composition.product.description,
      approved: composition.approved,
      capacity: capacities.length > 0 ? Math.min(...capacities) : null
    };
  });

  return (
    <>
      <section className="product-hero-panel">
        <div>
          <p className="eyebrow">Produtos e ficha tecnica</p>
          <h1>Produtos e ficha tecnica</h1>
          <p className="lead">
            Cadastro tecnico de pecas, insumos e composicoes para estimar producao, controlar estoque e orientar a fabrica.
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
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Produtos, pecas, insumos e materias-primas.</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top">
            <span className="mono">Pecas pre-moldadas</span>
            <Factory size={22} />
          </div>
          <strong className="metric-value">{precastCount}</strong>
          <span className="metric-sub">Lista real das pecas fabricadas pela equipe.</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top">
            <span className="mono">Insumos base</span>
            <ClipboardList size={22} />
          </div>
          <strong className="metric-value">{rawMaterialCount}</strong>
          <span className="metric-sub">Materiais usados nas composicoes.</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top">
            <span className="mono">Fichas aprovadas</span>
            <Ruler size={22} />
          </div>
          <strong className="metric-value">{activeCompositions}</strong>
          <span className="metric-sub">Composicoes liberadas para uso.</span>
        </article>
      </section>

      <section className="product-page-stack">
        <section className="product-section-card">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Foco da fabrica</p>
              <h2>Pecas que vamos controlar neste momento</h2>
              <p className="metric-sub">Pecas principais para controlar producao, cura, liberacao e estoque acabado.</p>
            </div>
            <span className="badge green">{precastItems.length} pecas</span>
          </div>
          <div className="precast-product-grid">
            {precastItems.map((item) => {
              const stockQuantity = item.stockBalances.reduce((total, balance) => total + decimalToNumber(balance.quantity), 0);

              return (
              <article className="precast-product-card" key={item.id}>
                <div className="precast-product-top">
                  <span className="mono">{item.code}</span>
                  <span className={item.active ? "badge green" : "badge red"}>
                    {item.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <h3>{item.description}</h3>
                <div className="product-card-meta">
                  <span>Grupo: {item.group || "Sem grupo"}</span>
                  <span>Unidade: {item.unit.code}</span>
                  <span>Cura: {item.curingHours}h</span>
                </div>
                <div className="lot-tags">
                  <span className="badge blue">Estoque: {formatQuantity(stockQuantity)} {item.unit.code}</span>
                  <a className="secondary-button mini-button" href="/produtos/composicoes/nova">Ficha técnica</a>
                </div>
              </article>
              );
            })}
            {precastItems.length === 0 ? (
              <p className="metric-sub">Rode o seed inicial para carregar as pecas de producao.</p>
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
              <span className="badge orange">{compositions.length} fichas</span>
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
                    <strong>
                      {compositionCapacity.find((item) => item.id === composition.id)?.capacity === null
                        ? "-"
                        : `${compositionCapacity.find((item) => item.id === composition.id)?.capacity ?? 0} un`}
                    </strong>
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
        </section>
      </section>
    </>
  );
}
