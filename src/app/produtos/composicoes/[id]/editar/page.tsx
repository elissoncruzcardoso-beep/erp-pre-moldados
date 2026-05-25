import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { CompositionForm } from "../../../composition-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function decimalToString(value: unknown) {
  return decimalToNumber(value).toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: false
  });
}

export default async function EditarComposicaoPage({ params }: PageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/produtos");
  }

  if (!session.permissions.includes("produtos.manage")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const prisma = getPrisma();
  const [items, composition] = await Promise.all([
    prisma.item.findMany({
      include: {
        unit: true,
        stockBalances: true
      },
      orderBy: [{ type: "asc" }, { code: "asc" }]
    }),
    prisma.composition.findUnique({
      where: { id },
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
                unit: true
              }
            }
          },
          orderBy: {
            id: "asc"
          }
        },
        orders: true
      }
    })
  ]);

  if (!composition) {
    notFound();
  }

  if (composition.orders.length > 0) {
    redirect("/produtos");
  }

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
          <p className="eyebrow">Produtos / composicao</p>
          <h1>Editar composicao</h1>
          <p className="lead">
            Ajuste os insumos da ficha tecnica em uma pagina dedicada, sem abrir edicao dentro da listagem.
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
            {composition.code}
          </span>
        </div>
      </section>

      <CompositionForm
        mode="edit"
        compositionId={composition.id}
        products={products}
        materials={materials}
        initialData={{
          code: composition.code,
          productId: composition.productId,
          version: composition.version,
          revision: composition.revision,
          baseQuantity: decimalToString(composition.baseQuantity),
          expectedLoss: decimalToString(composition.expectedLoss),
          curingHours: String(composition.curingHours ?? composition.product.curingHours),
          approved: composition.approved,
          items: composition.items.map((item) => ({
            itemId: item.itemId,
            quantity: decimalToString(item.quantity),
            lossPercent: decimalToString(item.lossPercent),
            stage: item.stage || ""
          }))
        }}
      />
    </>
  );
}
