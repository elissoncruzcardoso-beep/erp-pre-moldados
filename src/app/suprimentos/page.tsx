import {
  ChevronRight,
  ClipboardList,
  FileBarChart,
  FileText,
  PackageCheck,
  ReceiptText,
  Ruler,
  ShoppingCart,
  Truck,
  WalletCards
} from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";

const groups = [
  {
    title: "Compras",
    description: "Ambiente para solicitacoes, cotacoes, pedidos e notas fiscais de compra.",
    icon: ShoppingCart,
    accent: "accent-blue",
    items: [
      ["Solicitacoes de Compra", "Requisicoes internas por producao, obra, almoxarifado ou administrativo."],
      ["Cotacoes de Precos", "Comparativo de fornecedores, prazo, condicao e historico de preco."],
      ["Pedidos de Compra", "Pedidos aprovados com previsao de entrega e integracao futura com recebimento."],
      ["Notas Fiscais de Compra", "Entrada documental para conferencia, financeiro e liberacao para estoque."],
      ["Relatorios", "Acompanhamento de compras pendentes, atrasos e gastos por centro de custo."],
      ["Relatorios Configuraveis", "Visoes customizadas para diretoria, compras e almoxarifado."]
    ]
  },
  {
    title: "Contratos e Medicoes",
    description: "Ambiente para servicos contratados, contratos, medicoes e evolucao fisica/financeira.",
    icon: Ruler,
    accent: "accent-orange",
    items: [
      ["Solicitacoes de Servicos", "Abertura de demanda para mao de obra, manutencao, transporte ou terceiros."],
      ["Contratos", "Cadastro de contratos, valores, fornecedores, vigencia e escopo contratado."],
      ["Medicoes", "Controle do realizado por periodo para liberar pagamento ou aprovacao tecnica."],
      ["Relatorios", "Resumo de contratos em aberto, medicoes pendentes e saldo contratado."]
    ]
  },
  {
    title: "Recebimento e Conferencia",
    description: "Ambiente para conferir entregas, validar documentos e liberar entrada no estoque.",
    icon: Truck,
    accent: "accent-gray",
    items: [
      ["Entregas Previstas", "Pedidos aprovados aguardando chegada, descarga ou agendamento."],
      ["Conferencia de Materiais", "Validacao de quantidade, item, fornecedor, lote e divergencias."],
      ["Liberacao para Estoque", "Aprovacao do recebimento para gerar entrada no modulo Estoque."],
      ["Divergencias de Recebimento", "Registro de falta, sobra, avaria, lote incorreto ou documento pendente."],
      ["Relatorios", "Acompanhamento de entregas, atrasos, divergencias e materiais aguardando liberacao."]
    ]
  }
];

const quickCards = [
  ["Solicitacoes abertas", "18", "Compras e servicos aguardando aprovacao"],
  ["Cotacoes em andamento", "7", "Fornecedores com prazo de resposta nesta semana"],
  ["Medicoes pendentes", "5", "Servicos aguardando conferencia tecnica"],
  ["Recebimentos pendentes", "12", "Pedidos aguardando conferencia ou liberacao"]
];

export default function SuprimentosPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Modulo de suprimentos</p>
          <h1>Ambientes de compras, contratos e recebimento</h1>
          <p className="lead">
            Estrutura separada por responsabilidade: Suprimentos cuida da compra, contrato,
            recebimento e conferencia. A movimentacao oficial de saldo, lote e inventario fica
            no modulo Estoque.
          </p>
        </div>
        <div className="button-row">
          <PrototypeAction
            className="primary-button"
            message="Central de suprimentos criada como ambiente visual. Na proxima etapa podemos ativar solicitacoes, cotacoes e pedidos."
          >
            <ClipboardList size={17} />
            Novo processo
          </PrototypeAction>
          <PrototypeAction
            className="secondary-button"
            message="Mapa de aprovacoes sera conectado futuramente com perfis, valores e centro de custo."
          >
            <WalletCards size={17} />
            Aprovacoes
          </PrototypeAction>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        {quickCards.map(([label, value, sub]) => (
          <article className="metric-card accent-blue span-3" key={label}>
            <div className="metric-top">
              <span className="mono">{label}</span>
              <PackageCheck size={21} />
            </div>
            <strong className="metric-value">{value}</strong>
            <span className="metric-sub">{sub}</span>
          </article>
        ))}
      </section>

      <section className="supply-layout">
        <aside className="supply-menu" aria-label="Ambientes de suprimentos">
          {groups.map((group) => (
            <div className="supply-menu-group" key={group.title}>
              <div className="supply-menu-title">
                <group.icon size={17} />
                <strong>{group.title}</strong>
              </div>
              <div className="supply-menu-items">
                {group.items.map(([item]) => (
                  <PrototypeAction
                    key={item}
                    className="supply-menu-item"
                    message={`${item}: ambiente visual criado no menu de suprimentos.`}
                  >
                    <span>{item}</span>
                    <ChevronRight size={15} />
                  </PrototypeAction>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <div className="supply-workspace">
          {groups.map((group) => (
            <article className={`card ${group.accent} supply-environment`} key={group.title}>
              <div className="supply-environment-head">
                <div>
                  <p className="eyebrow">{group.title}</p>
                  <h2>{group.description}</h2>
                </div>
                <group.icon size={28} color="#1a237e" />
              </div>

              <div className="supply-feature-grid">
                {group.items.map(([item, description]) => (
                  <PrototypeAction
                    key={item}
                    className="supply-feature"
                    message={`${item}: ambiente visual criado. Proxima etapa: desenhar formulario, tabela e fluxo de aprovacao.`}
                  >
                    {pickIcon(item)}
                    <span>
                      <strong>{item}</strong>
                      <small>{description}</small>
                    </span>
                    <ChevronRight size={16} />
                  </PrototypeAction>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function pickIcon(label: string) {
  if (label.includes("Nota")) return <ReceiptText size={19} />;
  if (label.includes("Relatorio")) return <FileBarChart size={19} />;
  if (label.includes("Contrato")) return <FileText size={19} />;
  if (label.includes("Entrega") || label.includes("Conferencia") || label.includes("Liberacao")) {
    return <Truck size={19} />;
  }
  return <ClipboardList size={19} />;
}
