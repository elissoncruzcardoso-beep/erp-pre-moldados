import { redirect } from "next/navigation";
import { Boxes, ClipboardList, Factory, Ruler, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { ProductCreateForm } from "./product-create-form";

export const dynamic = "force-dynamic";

function decimalToString(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  return String(value ?? "0");
}

const typeLabels: Record<string, string> = {
  MATERIA_PRIMA: "Materia-prima",
  INSUMO: "Insumo",
  PRODUTO_ACABADO: "Produto acabado",
  PECA_PRE_MOLDADA: "Peca pre-moldada",
  FORMA_MOLDE: "Forma/molde",
  SERVICO: "Servico"
};

export default async function ProdutosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/produtos");
  }

  if (!session.permissions.includes("produtos.manage")) {
    redirect("/diretoria");
  }

  const prisma = getPrisma();
  const [items, units, molds, compositions] = await Promise.all([
    prisma.item.findMany({
      include: {
        unit: true,
        stockBalances: true
      },
      orderBy: [{ type: "asc" }, { code: "asc" }]
    }),
    prisma.unitOfMeasure.findMany({ orderBy: { code: "asc" } }),
    prisma.mold.findMany({ orderBy: { code: "asc" } }),
    prisma.composition.findMany({
      include: {
        product: true,
        items: {
          include: {
            item: {
              include: {
                unit: true
              }
            }
          },
          orderBy: { stage: "asc" }
        }
      },
      orderBy: { code: "asc" }
    })
  ]);

  const precastCount = items.filter((item) => item.type === "PECA_PRE_MOLDADA").length;
  const rawMaterialCount = items.filter((item) => item.type === "MATERIA_PRIMA" || item.type === "INSUMO").length;
  const activeCompositions = compositions.filter((composition) => composition.approved).length;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Produtos e ficha tecnica</p>
          <h1>Cadastro tecnico de pecas, insumos e formas</h1>
          <p className="lead">
            Primeira tela do MVP real lendo dados do Supabase. Aqui centralizamos produtos,
            unidades, composicoes de materiais e formas/moldes usados pela producao.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Itens cadastrados</span>
            <Boxes size={22} />
          </div>
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Produtos, pecas, insumos e materias-primas.</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top">
            <span className="mono">Pecas pre-moldadas</span>
            <Factory size={22} />
          </div>
          <strong className="metric-value">{precastCount}</strong>
          <span className="metric-sub">Itens prontos para planejamento de producao.</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top">
            <span className="mono">Insumos base</span>
            <ClipboardList size={22} />
          </div>
          <strong className="metric-value">{rawMaterialCount}</strong>
          <span className="metric-sub">Materiais usados nas composicoes.</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top">
            <span className="mono">Fichas aprovadas</span>
            <Ruler size={22} />
          </div>
          <strong className="metric-value">{activeCompositions}</strong>
          <span className="metric-sub">Composicoes liberadas para uso.</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Catalogo</p>
              <h2>Itens tecnicos</h2>
            </div>
            <span className="badge blue">{units.length} unidades</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descricao</th>
                <th>Tipo</th>
                <th>Un.</th>
                <th>Estoque</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const stockQuantity = item.stockBalances.reduce((total, balance) => {
                  return total + Number(decimalToString(balance.quantity));
                }, 0);

                return (
                  <tr key={item.id}>
                    <td className="mono">{item.code}</td>
                    <td>{item.description}</td>
                    <td>{typeLabels[item.type] || item.type}</td>
                    <td className="mono">{item.unit.code}</td>
                    <td className="mono">{stockQuantity.toLocaleString("pt-BR")}</td>
                    <td>
                      <span className={item.active ? "badge green" : "badge red"}>
                        {item.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <aside className="product-side-stack span-4">
          <section className="card accent-blue product-side-panel">
            <p className="eyebrow">Novo cadastro</p>
            <h2>Adicionar produto</h2>
            <ProductCreateForm units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))} />
          </section>

          <section className="card accent-orange product-side-panel">
            <p className="eyebrow">Formas e moldes</p>
            <h2>Recursos produtivos</h2>
            <div className="split-list">
              {molds.map((mold) => (
                <div className="split-row" key={mold.id}>
                  <div>
                    <strong>{mold.name}</strong>
                    <span className="product-detail mono">{mold.code}</span>
                  </div>
                  <span className={mold.active ? "badge green" : "badge red"}>
                    {mold.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
              ))}
              {molds.length === 0 ? <p className="metric-sub">Nenhuma forma cadastrada ainda.</p> : null}
            </div>
          </section>
        </aside>

        <section className="card accent-blue span-12">
          <div className="table-header product-card-header">
            <div>
              <p className="eyebrow">Composicoes</p>
              <h2>Fichas tecnicas de producao</h2>
            </div>
            <span className="badge orange">{compositions.length} fichas</span>
          </div>
          <div className="composition-grid">
            {compositions.map((composition) => (
              <article className="composition-card" key={composition.id}>
                <div className="metric-top">
                  <span className="mono">{composition.code}</span>
                  <span className={composition.approved ? "badge green" : "badge orange"}>
                    {composition.approved ? "Aprovada" : "Em revisao"}
                  </span>
                </div>
                <h3>{composition.product.description}</h3>
                <p className="metric-sub">
                  Versao {composition.version} / revisao {composition.revision} - base{" "}
                  {decimalToString(composition.baseQuantity)}
                </p>
                <div className="composition-items">
                  {composition.items.map((compositionItem) => (
                    <div className="split-row" key={compositionItem.id}>
                      <span>{compositionItem.item.description}</span>
                      <strong className="mono">
                        {decimalToString(compositionItem.quantity)} {compositionItem.item.unit.code}
                      </strong>
                    </div>
                  ))}
                </div>
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
