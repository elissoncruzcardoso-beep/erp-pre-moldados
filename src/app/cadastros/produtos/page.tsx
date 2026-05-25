import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, ClipboardList, Factory, PackageSearch, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { ProductCreateForm } from "@/app/produtos/product-create-form";
import { CadastrosNav } from "../_components/cadastros-nav";
import { ProductCuringForm } from "./product-curing-form";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  MATERIA_PRIMA: "Matéria-prima",
  INSUMO: "Insumo",
  PRODUTO_ACABADO: "Produto acabado",
  PECA_PRE_MOLDADA: "Peça pré-moldada",
  FORMA_MOLDE: "Forma/molde",
  SERVICO: "Serviço"
};

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

function itemUsesCuring(type: string) {
  return type === "PECA_PRE_MOLDADA" || type === "PRODUTO_ACABADO";
}

export default async function CadastroProdutosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cadastros/produtos");
  }

  if (!session.permissions.includes("produtos.manage") && !session.permissions.includes("cadastros.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [items, units] = await Promise.all([
    prisma.item.findMany({
      include: {
        unit: true,
        stockBalances: true
      },
      orderBy: [{ type: "asc" }, { code: "asc" }],
      take: 60
    }),
    prisma.unitOfMeasure.findMany({ orderBy: { code: "asc" } })
  ]);
  const precastCount = items.filter((item) => item.type === "PECA_PRE_MOLDADA").length;
  const inputCount = items.filter((item) => item.type === "MATERIA_PRIMA" || item.type === "INSUMO").length;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Produtos, peças e insumos</h1>
          <p className="lead">
            Cadastro central de itens técnicos usados em estoque, suprimentos, composição e produção.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
          <Link className="secondary-button" href="/produtos">
            <Factory size={17} />
            Ver ficha técnica
          </Link>
        </div>
      </section>

      <CadastrosNav active="/cadastros/produtos" />

      <section className="product-metric-grid" style={{ marginBottom: 20 }}>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Itens</span><ClipboardList size={22} /></div>
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Produtos, peças, insumos e serviços cadastrados.</span>
        </article>
        <article className="product-metric-card accent-orange">
          <div className="metric-top"><span className="mono">Peças</span><Factory size={22} /></div>
          <strong className="metric-value">{precastCount}</strong>
          <span className="metric-sub">Itens de produção controlados pela fábrica.</span>
        </article>
        <article className="product-metric-card accent-gray">
          <div className="metric-top"><span className="mono">Insumos</span><Boxes size={22} /></div>
          <strong className="metric-value">{inputCount}</strong>
          <span className="metric-sub">Materiais disponíveis para ficha técnica.</span>
        </article>
        <article className="product-metric-card accent-blue">
          <div className="metric-top"><span className="mono">Unidades</span><PackageSearch size={22} /></div>
          <strong className="metric-value">{units.length}</strong>
          <span className="metric-sub">Base para quantidades e casas decimais.</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="product-section-card product-side-panel span-4">
          <p className="eyebrow">Novo cadastro</p>
          <h2>Adicionar produto</h2>
          <p className="metric-sub">
            Use esta tela para cadastrar peça, insumo, matéria-prima, forma/molde ou serviço.
          </p>
          <ProductCreateForm units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))} />
        </section>

        <section className="table-shell product-table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Consulta rápida</p>
              <h2>Últimos itens cadastrados</h2>
            </div>
            <span className="badge blue">{items.length} itens</span>
          </div>
          <div className="table-scroll">
            <table className="technical-items-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Grupo</th>
                  <th>Un.</th>
                  <th>Cura</th>
                  <th className="number-cell">Estoque</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const stockQuantity = item.stockBalances.reduce((sum, balance) => sum + decimalToNumber(balance.quantity), 0);

                  return (
                    <tr key={item.id}>
                      <td className="mono">{item.code}</td>
                      <td>{item.description}</td>
                      <td><span className="badge blue">{typeLabels[item.type] || item.type}</span></td>
                      <td>{item.group || "-"}</td>
                      <td className="mono">{item.unit.code}</td>
                      <td>
                        {itemUsesCuring(item.type) ? (
                          <ProductCuringForm itemId={item.id} curingHours={item.curingHours} />
                        ) : (
                          <span className="metric-sub">N/A</span>
                        )}
                      </td>
                      <td className="mono number-cell">{formatQuantity(stockQuantity)}</td>
                      <td><span className={item.active ? "badge green" : "badge red"}>{item.active ? "Ativo" : "Inativo"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}
