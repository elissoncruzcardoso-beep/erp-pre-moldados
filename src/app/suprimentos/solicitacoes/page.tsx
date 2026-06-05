import { ClipboardList, PackageCheck } from "lucide-react";
import { getPrisma } from "@/lib/db/prisma";
import { SuprimentosNav } from "../_components/suprimentos-nav";
import { decimalToNumber, requireSuprimentosSession, statusLabels } from "../_lib";
import { PurchaseRequestActions } from "../purchase-request-actions";
import { PurchaseRequestForm } from "../purchase-request-form";

export const dynamic = "force-dynamic";

export default async function SolicitacoesPage() {
  const session = await requireSuprimentosSession("/suprimentos/solicitacoes");
  const prisma = getPrisma();
  const [items, requests] = await Promise.all([
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
        },
        _count: {
          select: {
            quotes: true,
            orders: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 30
    })
  ]);

  const openRequests = requests.filter((request) => request.status === "ABERTA").length;
  const urgentRequests = requests.filter((request) => request.priority === "URGENTE" || request.priority === "ALTA").length;
  const itemOptions = items.map((item) => ({
    id: item.id,
    code: item.code,
    description: item.description,
    unitCode: item.unit.code
  }));

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h1>Solicitacoes de compra</h1>
          <p className="lead">Registre demandas de compra com varios itens em uma unica solicitacao.</p>
        </div>
        <span className="status-pill">
          <ClipboardList size={16} />
          Solicitante: {session.name}
        </span>
      </section>

      <SuprimentosNav />

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-4">
          <div className="metric-top"><span className="mono">Solicitacoes abertas</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{openRequests}</strong>
          <span className="metric-sub">Aguardando cotacao ou analise</span>
        </article>
        <article className="metric-card accent-orange span-4">
          <div className="metric-top"><span className="mono">Prioridade alta</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{urgentRequests}</strong>
          <span className="metric-sub">Demandas urgentes do operacional</span>
        </article>
        <article className="metric-card accent-gray span-4">
          <div className="metric-top"><span className="mono">Itens compraveis</span><PackageCheck size={21} /></div>
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Materiais e servicos ativos</span>
        </article>
      </section>

      <section className="card accent-blue supply-form-card" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Nova solicitacao</p>
        <h2>Solicitar compra</h2>
        <p className="metric-sub">Monte uma demanda com varios itens antes de enviar para cotacao.</p>
        <PurchaseRequestForm items={itemOptions} />
      </section>

      <section className="supply-record-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Compras</p>
            <h2>Solicitacoes recentes</h2>
          </div>
          <span className="badge blue">{requests.length} registros</span>
        </div>
        <div className="supply-record-stack">
          {requests.map((request) => {
            const lockedStatus = request.status === "EM_COTACAO" || request.status === "CONVERTIDA_PEDIDO" || request.status === "CANCELADA";
            const locked = lockedStatus || request._count.quotes > 0 || request._count.orders > 0;

            return (
              <article className="supply-record-card" key={request.id}>
                <div className="supply-record-main">
                  <div className="supply-record-title">
                    <div>
                      <p className="eyebrow">Solicitacao</p>
                      <h3 className="mono">{request.number}</h3>
                      <span className="metric-sub">{request.department || "Sem departamento"} | {request.costCenter || "Sem centro de custo"}</span>
                    </div>
                    <div className="supplier-quote-badges">
                      <span className={request.priority === "URGENTE" || request.priority === "ALTA" ? "badge orange" : "badge"}>
                        {request.priority}
                      </span>
                      <span className="badge blue">{statusLabels[request.status] || request.status}</span>
                    </div>
                  </div>

                  <div className="quote-meta-grid">
                    <div>
                      <span>Necessario</span>
                      <strong>{request.neededAt ? request.neededAt.toLocaleDateString("pt-BR") : "-"}</strong>
                    </div>
                    <div>
                      <span>Solicitante</span>
                      <strong>{request.requester.name}</strong>
                    </div>
                    <div>
                      <span>Andamento</span>
                      <strong>{request._count.quotes} cot. / {request._count.orders} ped.</strong>
                    </div>
                  </div>

                  <div className="supply-item-list-card">
                    {request.items.length > 0 ? request.items.map((requestItem) => (
                      <span className="daily-item-pill" key={requestItem.id}>
                        {requestItem.item.code}: {decimalToNumber(requestItem.quantity).toLocaleString("pt-BR")} {requestItem.item.unit.code}
                      </span>
                    )) : <span className="metric-sub">Sem item</span>}
                  </div>
                </div>

                <aside className="supply-record-actions">
                  <PurchaseRequestActions
                    requestId={request.id}
                    locked={locked}
                    items={itemOptions}
                    editData={{
                      id: request.id,
                      number: request.number,
                      department: request.department || "",
                      costCenter: request.costCenter || "",
                      priority: request.priority,
                      neededAt: request.neededAt ? request.neededAt.toISOString().slice(0, 10) : "",
                      justification: request.justification || "",
                      items: request.items.map((requestItem) => ({
                        itemId: requestItem.itemId,
                        quantity: decimalToNumber(requestItem.quantity).toString(),
                        note: requestItem.note || ""
                      }))
                    }}
                  />
                </aside>
              </article>
            );
          })}
          {requests.length === 0 ? (
            <article className="card accent-gray">
              <p className="eyebrow">Solicitacoes</p>
              <h2>Nenhuma solicitacao criada ainda.</h2>
            </article>
          ) : null}
        </div>
      </section>
    </>
  );
}
