import Link from "next/link";
import { Boxes, Calculator, ClipboardList, CreditCard, HandCoins, Ruler, Settings2, ShieldCheck, Truck, Users } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { CadastrosNav } from "./_components/cadastros-nav";

export const dynamic = "force-dynamic";

const modules = [
  {
    href: "/cadastros/produtos",
    title: "Produtos, peças e insumos",
    description: "Cadastre peças pré-moldadas, produtos acabados, matérias-primas, insumos, formas e serviços.",
    icon: ClipboardList
  },
  {
    href: "/cadastros/unidades",
    title: "Unidades de medida",
    description: "Padronize UN, KG, M3, L e casas decimais usadas em estoque, compras e produção.",
    icon: Ruler
  },
  {
    href: "/cadastros/clientes",
    title: "Clientes",
    description: "Cadastre clientes avulsos e recorrentes para vendas, contas a receber e recibos.",
    icon: Users
  },
  {
    href: "/cadastros/fornecedores",
    title: "Fornecedores",
    description: "Cadastre fornecedores para cotações, pedidos, recebimentos, notas fiscais e contas a pagar.",
    icon: Truck
  },
  {
    href: "/cadastros/grupos-insumos",
    title: "Grupos de insumos",
    description: "Organize cimento, aço, agregados, aditivos, EPIs e serviços para compras e composição.",
    icon: Boxes
  },
  {
    href: "/cadastros/grupos-financeiros",
    title: "Grupos financeiros",
    description: "Classifique entradas e saídas para contas a pagar, receber, fluxo de caixa e relatórios.",
    icon: Calculator
  },
  {
    href: "/cadastros/formas-pagamento",
    title: "Formas de pagamento",
    description: "Padronize Pix, dinheiro, boleto, cartao e condicoes usadas em vendas e baixas.",
    icon: CreditCard
  },
  {
    href: "/cadastros/tipos-baixa",
    title: "Tipos de baixas financeiras",
    description: "Classifique recebimentos, pagamentos, descontos, juros, estornos e ajustes financeiros.",
    icon: HandCoins
  }
];

export default async function CadastrosPage() {
  const session = await requirePageSession({ nextPath: "/cadastros", permission: "cadastros.manage" });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Configuração do ERP</p>
          <h1>Cadastros base</h1>
          <p className="lead">
            Central para manter os padrões que alimentam produtos, estoque, suprimentos, produção e financeiro.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Acesso: {session.role}
          </span>
        </div>
      </section>

      <CadastrosNav />

      <section className="production-action-grid">
        {modules.map((module) => (
          <Link className="production-action-card accent-blue" href={module.href} key={module.href}>
            <module.icon size={26} />
            <div>
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="card accent-orange" style={{ marginTop: 20 }}>
        <p className="eyebrow">Regra de organização</p>
        <h2>Menos texto solto, mais padrão</h2>
        <p className="lead">
          A ideia é que produto, compras, estoque e financeiro usem estes cadastros como listas padrão.
          Assim os relatórios ficam mais confiáveis e fáceis de analisar pela diretoria.
        </p>
        <div className="report-chip-list" style={{ marginTop: 16 }}>
          <span className="report-chip"><Settings2 size={15} /> Padronização</span>
          <span className="report-chip"><Boxes size={15} /> Composição técnica</span>
          <span className="report-chip"><Calculator size={15} /> Classificação financeira</span>
        </div>
      </section>
    </>
  );
}
