import { redirect } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  FileBarChart,
  FileSearch,
  FileText,
  PackageCheck,
  ReceiptText,
  Ruler,
  ShoppingCart,
  Truck,
  WalletCards
} from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { PurchaseQuoteActions } from "./purchase-quote-actions";
import { PurchaseQuoteForm } from "./purchase-quote-form";
import { PurchaseReceiptForm } from "./purchase-receipt-form";
import { PurchaseRequestForm } from "./purchase-request-form";

export const dynamic = "force-dynamic";

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

const statusLabels: Record<string, string> = {
  ABERTA: "Aberta",
  EM_COTACAO: "Em cotacao",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  CONVERTIDA_PEDIDO: "Convertida em pedido",
  CANCELADA: "Cancelada"
};

const quoteStatusLabels: Record<string, string> = {
  RECEBIDA: "Recebida",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  CANCELADA: "Cancelada"
};

const orderStatusLabels: Record<string, string> = {
  EMITIDO: "Emitido",
  ENVIADO: "Enviado",
  PARCIALMENTE_RECEBIDO: "Parcial",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

const receiptStatusLabels: Record<string, string> = {
  LIBERADO_ESTOQUE: "Liberado estoque",
  DIVERGENTE: "Divergente",
  CANCELADO: "Cancelado"
};

function quoteBadgeClass(status: string) {
  if (status === "APROVADA") return "badge green";
  if (status === "REPROVADA" || status === "CANCELADA") return "badge red";
  return "badge blue";
}

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function formatCurrency(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default async function SuprimentosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/suprimentos");
  }

  if (!session.permissions.includes("suprimentos.view")) {
    redirect("/diretoria");
  }

  const prisma = getPrisma();
  const [items, requests, suppliers, quotes, orders, warehouses, receipts] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        type: { in: ["MATERIA_PRIMA", "INSUMO", "FORMA_MOLDE", "SERVICO"] }
      },
      include: { unit: true },
      orderBy: { code: "asc" }
    }),
    prisma.purchaseRequest.findMany({
      include: {
        requester: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.purchaseQuote.findMany({
      include: {
        supplier: true,
        purchaseOrder: true,
        purchaseRequest: {
          include: {
            items: {
              include: {
                item: {
                  include: { unit: true }
                }
              }
            }
          }
        },
        createdBy: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        purchaseQuote: true,
        purchaseRequest: true,
        items: {
          include: {
            item: {
              include: { unit: true }
            },
            receipts: true
          }
        },
        createdBy: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.purchaseReceipt.findMany({
      include: {
        purchaseOrder: true,
        purchaseOrderItem: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        },
        warehouse: true,
        lot: true,
        stockMovement: true,
        receivedBy: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const openRequests = requests.filter((request) => request.status === "ABERTA").length;
  const urgentRequests = requests.filter((request) => request.priority === "URGENTE" || request.priority === "ALTA").length;
  const issuedOrders = orders.filter((order) => order.status === "EMITIDO" || order.status === "ENVIADO").length;
  const receiptOptions = orders.flatMap((order) =>
    order.items
      .map((item) => {
        const accepted = item.receipts?.reduce((sum, receipt) => sum + decimalToNumber(receipt.acceptedQuantity), 0) ?? 0;
        const pendingQuantity = Math.max(decimalToNumber(item.quantity) - accepted, 0);

        return {
          id: item.id,
          orderNumber: order.number,
          item: `${item.item.code} - ${item.item.description}`,
          pendingQuantity,
          unitCode: item.item.unit.code
        };
      })
      .filter((item) => item.pendingQuantity > 0)
  );
  const requestOptions = requests
    .filter((request) => request.status === "ABERTA" || request.status === "EM_COTACAO")
    .map((request) => {
      const firstItem = request.items[0];

      return {
        id: request.id,
        number: request.number,
        item: firstItem ? `${firstItem.item.code} - ${firstItem.item.description}` : "Sem item",
        status: statusLabels[request.status] || request.status
      };
    });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Modulo de suprimentos</p>
          <h1>Compras, contratos e recebimento</h1>
          <p className="lead">
            Suprimentos agora inicia o fluxo real com Solicitacao de Compra. A compra nasce aqui,
            passa por cotacao/pedido nas proximas fases e so movimenta saldo quando for liberada
            no modulo Estoque.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ClipboardList size={16} />
            Solicitante: {session.name}
          </span>
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
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Solicitacoes abertas</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{openRequests}</strong>
          <span className="metric-sub">Compras aguardando analise</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Prioridade alta</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{urgentRequests}</strong>
          <span className="metric-sub">Itens com urgencia operacional</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Itens compraveis</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Materiais e servicos cadastrados</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Pedidos emitidos</span><FileSearch size={21} /></div>
          <strong className="metric-value">{issuedOrders}</strong>
          <span className="metric-sub">Aguardando envio/recebimento</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <section className="card accent-blue span-6">
          <p className="eyebrow">Nova solicitacao</p>
          <h2>Solicitar compra</h2>
          <PurchaseRequestForm
            items={items.map((item) => ({
              id: item.id,
              code: item.code,
              description: item.description,
              unitCode: item.unit.code
            }))}
          />
        </section>

        <section className="card accent-orange span-6">
          <p className="eyebrow">Nova cotacao</p>
          <h2>Cotar fornecedor</h2>
          <PurchaseQuoteForm
            requests={requestOptions}
            suppliers={suppliers.map((supplier) => ({
              id: supplier.id,
              code: supplier.code,
              name: supplier.name
            }))}
          />
        </section>
      </section>

      <section className="card accent-gray" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Recebimento e conferencia</p>
        <h2>Conferir entrega e liberar estoque</h2>
        <PurchaseReceiptForm
          orderItems={receiptOptions}
          warehouses={warehouses.map((warehouse) => ({
            id: warehouse.id,
            code: warehouse.code,
            name: warehouse.name
          }))}
        />
      </section>

      <section className="table-shell" style={{ marginBottom: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Compras</p>
            <h2>Solicitacoes recentes</h2>
          </div>
          <span className="badge blue">{requests.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Numero</th>
              <th>Item</th>
              <th>Qtd.</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Necessario</th>
              <th>Solicitante</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const firstItem = request.items[0];

              return (
                <tr key={request.id}>
                  <td className="mono">{request.number}</td>
                  <td>{firstItem ? `${firstItem.item.code} - ${firstItem.item.description}` : "-"}</td>
                  <td className="mono">
                    {firstItem ? `${decimalToNumber(firstItem.quantity).toLocaleString("pt-BR")} ${firstItem.item.unit.code}` : "-"}
                  </td>
                  <td><span className={request.priority === "URGENTE" || request.priority === "ALTA" ? "badge orange" : "badge"}>{request.priority}</span></td>
                  <td><span className="badge blue">{statusLabels[request.status] || request.status}</span></td>
                  <td>{request.neededAt ? request.neededAt.toLocaleDateString("pt-BR") : "-"}</td>
                  <td>{request.requester.name}</td>
                </tr>
              );
            })}
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhuma solicitacao criada ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginBottom: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Cotacoes</p>
            <h2>Comparativo de fornecedores</h2>
          </div>
          <span className="badge blue">{quotes.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cotacao</th>
              <th>Solicitacao</th>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Frete</th>
              <th>Entrega</th>
              <th>Status</th>
              <th>Responsavel</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const firstItem = quote.purchaseRequest.items[0];

              return (
                <tr key={quote.id}>
                  <td className="mono">{quote.number}</td>
                  <td>
                    <span className="mono">{quote.purchaseRequest.number}</span>
                    <br />
                    <small>{firstItem ? `${firstItem.item.code} - ${firstItem.item.description}` : "Sem item"}</small>
                  </td>
                  <td>{quote.supplier.name}</td>
                  <td className="mono">{formatCurrency(quote.totalValue)}</td>
                  <td className="mono">{formatCurrency(quote.freightCost)}</td>
                  <td>{quote.deliveryDays === null ? "-" : `${quote.deliveryDays} dias`}</td>
                  <td><span className={quoteBadgeClass(quote.status)}>{quoteStatusLabels[quote.status] || quote.status}</span></td>
                  <td>{quote.createdBy.name}</td>
                  <td>
                    <PurchaseQuoteActions
                      quoteId={quote.id}
                      status={quote.status}
                      hasOrder={Boolean(quote.purchaseOrder)}
                    />
                  </td>
                </tr>
              );
            })}
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={9}>Nenhuma cotacao registrada ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginBottom: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Pedidos de Compra</p>
            <h2>Pedidos gerados por cotacao aprovada</h2>
          </div>
          <span className="badge blue">{orders.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cotacao</th>
              <th>Fornecedor</th>
              <th>Itens</th>
              <th>Total</th>
              <th>Entrega prevista</th>
              <th>Status</th>
              <th>Responsavel</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const firstItem = order.items[0];

              return (
                <tr key={order.id}>
                  <td className="mono">{order.number}</td>
                  <td className="mono">{order.purchaseQuote.number}</td>
                  <td>{order.supplier.name}</td>
                  <td>
                    <span className="badge">{order.items.length} item(ns)</span>
                    <br />
                    <small>{firstItem ? `${firstItem.item.code} - ${firstItem.item.description}` : "Sem item"}</small>
                  </td>
                  <td className="mono">{formatCurrency(order.totalValue)}</td>
                  <td>{order.expectedDeliveryAt ? order.expectedDeliveryAt.toLocaleDateString("pt-BR") : "-"}</td>
                  <td><span className="badge green">{orderStatusLabels[order.status] || order.status}</span></td>
                  <td>{order.createdBy.name}</td>
                </tr>
              );
            })}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8}>Nenhum pedido de compra gerado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginBottom: 16 }}>
        <div className="table-header">
          <div>
            <p className="eyebrow">Recebimentos</p>
            <h2>Conferencias liberadas para estoque</h2>
          </div>
          <span className="badge blue">{receipts.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Recebimento</th>
              <th>Pedido</th>
              <th>Item</th>
              <th>Recebido</th>
              <th>Aceito</th>
              <th>Deposito</th>
              <th>Lote</th>
              <th>Movimento</th>
              <th>Status</th>
              <th>Responsavel</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td className="mono">{receipt.number}</td>
                <td className="mono">{receipt.purchaseOrder.number}</td>
                <td>{receipt.purchaseOrderItem.item.code} - {receipt.purchaseOrderItem.item.description}</td>
                <td className="mono">
                  {decimalToNumber(receipt.receivedQuantity).toLocaleString("pt-BR")} {receipt.purchaseOrderItem.item.unit.code}
                </td>
                <td className="mono">
                  {decimalToNumber(receipt.acceptedQuantity).toLocaleString("pt-BR")} {receipt.purchaseOrderItem.item.unit.code}
                </td>
                <td>{receipt.warehouse.code}</td>
                <td>{receipt.lot?.code || "-"}</td>
                <td className="mono">{receipt.stockMovement ? "ENTRADA_COMPRA" : "-"}</td>
                <td>
                  <span className={receipt.status === "DIVERGENTE" ? "badge orange" : "badge green"}>
                    {receiptStatusLabels[receipt.status] || receipt.status}
                  </span>
                </td>
                <td>{receipt.receivedBy.name}</td>
              </tr>
            ))}
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={10}>Nenhum recebimento registrado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
