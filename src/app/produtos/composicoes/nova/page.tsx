import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/formatters";
import { CompositionForm } from "../../composition-form";

export const dynamic = "force-dynamic";

export default async function NovaComposicaoPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/produtos/composicoes/nova");
  }

  if (!session.permissions.includes("produtos.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const items = await prisma.item.findMany({
    include: {
      unit: true,
      stockBalances: true
    },
    orderBy: [{ type: "asc" }, { code: "asc" }]
  });

  const products = items
    .filter((item) => item.active && (item.type === "PECA_PRE_MOLDADA" || item.type === "PRODUTO_ACABADO"))
    .map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      unitCode: item.unit.code,
      curingHours: item.curingHours
    }));

  const materials = items
    .filter((item) => item.active && (item.type === "MATERIA_PRIMA" || item.type === "INSUMO"))
    .map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      unitCode: item.unit.code,
      stockQuantity: item.stockBalances.reduce((sum, balance) => sum + decimalToNumber(balance.quantity), 0),
      standardCost: decimalToNumber(item.standardCost)
    }));

  return (
    <>
      <section className="product-hero-panel composition-hero-panel">
        <div>
          <p className="eyebrow">Produtos / composição</p>
          <h1>Cadastrar composição</h1>
          <p className="lead">
            Monte a ficha técnica lançando todos os insumos da peça em uma grade única e salve a composição ao final.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
          <a className="secondary-button" href="/produtos">
            <ArrowLeft size={17} />
            Voltar
          </a>
          <span className="primary-button ghost-action">
            <ClipboardList size={17} />
            Nova ficha técnica
          </span>
        </div>
      </section>

      <CompositionForm products={products} materials={materials} />
    </>
  );
}
