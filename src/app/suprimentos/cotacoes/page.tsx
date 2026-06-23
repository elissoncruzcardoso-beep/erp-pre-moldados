import { FileSearch, Trophy } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { makeComparisonMapNumber } from "@/lib/codes/supply-sequence";
import { getPrisma } from "@/lib/db/prisma";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { FORM_OPTION_LIMIT } from "@/lib/query-limits";
import { SuprimentosNav } from "../_components/suprimentos-nav";
import {
  decimalToNumber,
  formatCurrency,
  quoteBadgeClass,
  quoteStatusLabels,
  requireSuprimentosSession,
  statusLabels
} from "../_lib";
import { PurchaseQuoteActions } from "../purchase-quote-actions";
import { PurchaseQuoteForm } from "../purchase-quote-form";
import { QuoteTabs } from "./quote-tabs";

export const dynamic = "force-dynamic";

type CotacoesPageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function CotacoesPage({ searchParams }: CotacoesPageProps) {
  await requireSuprimentosSession("/suprimentos/cotacoes");
  const prisma = getPrisma();
  const params = (await searchParams) || {};
  const quotePagination = parsePagination(params, {
    pageParam: "cotacoesPage",
    defaultPageSize: 12,
    maxPageSize: 60
  });
  const mapPagination = parsePagination(params, {
    pageParam: "mapaPage",
    defaultPageSize: 6,
    maxPageSize: 30
  });
  const [requests, suppliers, quotes, quotesCount, mapQuotes] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: {
        status: { in: ["ABERTA", "EM_COTACAO"] }
      },
      include: {
        items: {
          include: {
            item: {
              include: { unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.purchaseQuote.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            supplier: true,
            item: {
              include: { unit: true }
            }
          }
        },
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
      skip: quotePagination.skip,
      take: quotePagination.pageSize
    }),
    prisma.purchaseQuote.count(),
    prisma.purchaseQuote.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            supplier: true,
            item: {
              include: { unit: true }
            }
          }
        },
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
      take: FORM_OPTION_LIMIT
    })
  ]);

  const requestOptions = requests.map((request) => {
    const itemLabels = request.items.map((requestItem) =>
      `${requestItem.item.code} - ${requestItem.item.description}: ${decimalToNumber(requestItem.quantity).toLocaleString("pt-BR")} ${requestItem.item.unit.code}`
    );

    return {
      id: request.id,
      number: request.number,
      item: itemLabels[0] || "Sem item",
      requestItems: request.items.map((requestItem) => ({
        id: requestItem.id,
        itemId: requestItem.itemId,
        label: `${requestItem.item.code} - ${requestItem.item.description}`,
        quantity: decimalToNumber(requestItem.quantity),
        unitCode: requestItem.item.unit.code,
        note: requestItem.note || ""
      })),
      items: itemLabels,
      status: statusLabels[request.status] || request.status
    };
  });
  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.id,
    code: supplier.code,
    name: supplier.name
  }));
  const buildEditData = (quote: (typeof quotes)[number]) => {
    const lineFreight = quote.items.reduce((sum, item) => sum + decimalToNumber(item.freightCost), 0);
    const headerFreight = Math.max(decimalToNumber(quote.freightCost) - lineFreight, 0);

    return {
      number: quote.number,
      purchaseRequestId: quote.purchaseRequestId,
      supplierId: quote.supplierId,
      deliveryDays: quote.deliveryDays,
      paymentTerms: quote.paymentTerms || "",
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
      freightCost: headerFreight,
      note: quote.note || "",
      items: quote.items.map((quoteItem) => ({
        purchaseRequestItemId: quoteItem.purchaseRequestItemId,
        itemId: quoteItem.itemId,
        label: `${quoteItem.item.code} - ${quoteItem.item.description}`,
        quantity: decimalToNumber(quoteItem.quantity),
        unitCode: quoteItem.item.unit.code,
        unitPrice: decimalToNumber(quoteItem.unitPrice),
        discountValue: decimalToNumber(quoteItem.discountValue),
        freightCost: decimalToNumber(quoteItem.freightCost),
        note: quoteItem.note || ""
      }))
    };
  };
  const quoteGroups = Array.from(
    mapQuotes.reduce((map, quote) => {
      const current = map.get(quote.purchaseRequestId) || [];
      current.push(quote);
      map.set(quote.purchaseRequestId, current);
      return map;
    }, new Map<string, typeof mapQuotes>())
  )
    .map(([purchaseRequestId, groupQuotes]) => {
      const winner = groupQuotes.reduce((best, current) => {
        const bestValue = decimalToNumber(best.totalValue);
        const currentValue = decimalToNumber(current.totalValue);

        if (currentValue < bestValue) return current;
        if (currentValue === bestValue && (current.deliveryDays ?? 9999) < (best.deliveryDays ?? 9999)) {
          return current;
        }

        return best;
      }, groupQuotes[0]);

      return {
        purchaseRequestId,
        requestNumber: groupQuotes[0].purchaseRequest.number,
        mapNumber: makeComparisonMapNumber(groupQuotes[0].purchaseRequest.number),
        quotes: groupQuotes,
        winner,
        priceRangeByRequestItem: groupQuotes.reduce((map, quote) => {
          quote.items.forEach((item) => {
            const current = map.get(item.purchaseRequestItemId) || {
              min: decimalToNumber(item.unitPrice),
              max: decimalToNumber(item.unitPrice)
            };
            const unitPrice = decimalToNumber(item.unitPrice);

            map.set(item.purchaseRequestItemId, {
              min: Math.min(current.min, unitPrice),
              max: Math.max(current.max, unitPrice)
            });
          });

          return map;
        }, new Map<string, { min: number; max: number }>())
      };
    })
    .sort((a, b) => b.quotes[0].createdAt.getTime() - a.quotes[0].createdAt.getTime());
  const quotePaginationMeta = getPaginationMeta(quotesCount, quotePagination.page, quotePagination.pageSize);
  const mapPaginationMeta = getPaginationMeta(quoteGroups.length, mapPagination.page, mapPagination.pageSize);
  const paginatedQuoteGroups = quoteGroups.slice(
    (mapPaginationMeta.page - 1) * mapPaginationMeta.pageSize,
    mapPaginationMeta.page * mapPaginationMeta.pageSize
  );

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h1>Cotacoes de precos</h1>
          <p className="lead">Compare fornecedores com preco, desconto e frete por item da solicitacao.</p>
        </div>
        <span className="status-pill">
          <FileSearch size={16} />
          {quotesCount} cotacoes
        </span>
      </section>

      <SuprimentosNav />

      <QuoteTabs
        form={
          <section className="card accent-orange supply-form-card">
            <p className="eyebrow">Nova cotacao</p>
            <h2>Cotar fornecedor</h2>
            <p className="metric-sub">Lance ate tres fornecedores para a mesma solicitacao e gere o mapa comparativo automaticamente.</p>
            <PurchaseQuoteForm
              requests={requestOptions}
              suppliers={supplierOptions}
            />
          </section>
        }
        map={
          <section className="comparison-map-stack">
            <div className="table-header">
              <div>
                <p className="eyebrow">Mapa comparativo</p>
                <h2>Escolha do fornecedor vencedor</h2>
              </div>
              <span className="badge blue">{quoteGroups.length} solicitacoes cotadas</span>
            </div>

            {paginatedQuoteGroups.map((group) => (
              <article className="comparison-map-card" key={group.purchaseRequestId}>
                <div className="comparison-map-head">
                  <div>
                    <p className="eyebrow">Solicitacao</p>
                    <h3>{group.mapNumber}</h3>
                    <span className="metric-sub">
                      Solicitacao {group.requestNumber} | {group.quotes.length} fornecedor(es) no comparativo
                    </span>
                  </div>
                  <span className="badge green">
                    <Trophy size={14} />
                    Melhor valor: {group.winner.supplier.name}
                  </span>
                </div>

                <div className="quote-card-stack">
                  {group.quotes.map((quote) => {
                    const isWinner = quote.id === group.winner.id;
                    const itemsTotal = quote.items.reduce((sum, item) => sum + decimalToNumber(item.totalValue), 0);
                    const lineFreight = quote.items.reduce((sum, item) => sum + decimalToNumber(item.freightCost), 0);
                    const totalDiscount = quote.items.reduce((sum, item) => sum + decimalToNumber(item.discountValue), 0);
                    const generalFreight = Math.max(decimalToNumber(quote.freightCost) - lineFreight, 0);

                    return (
                      <article className={`supplier-quote-card ${isWinner ? "winner" : ""}`} key={quote.id}>
                        <div className="supplier-quote-main">
                          <div className="supplier-quote-title">
                            <div>
                              <p className="eyebrow">Fornecedor</p>
                              <h4>{quote.supplier.name}</h4>
                              <span className="mono">{quote.number}</span>
                            </div>
                            <div className="supplier-quote-badges">
                              {isWinner ? (
                                <span className="badge green">
                                  <Trophy size={14} />
                                  Melhor opcao
                                </span>
                              ) : null}
                              <span className={quoteBadgeClass(quote.status)}>
                                {quoteStatusLabels[quote.status] || quote.status}
                              </span>
                            </div>
                          </div>

                          <div className="quote-meta-grid">
                            <div>
                              <span>Prazo</span>
                              <strong>{quote.deliveryDays === null ? "-" : `${quote.deliveryDays} dias`}</strong>
                            </div>
                            <div>
                              <span>Pagamento</span>
                              <strong>{quote.paymentTerms || "-"}</strong>
                            </div>
                            <div>
                              <span>Validade</span>
                              <strong>{quote.validUntil ? quote.validUntil.toLocaleDateString("pt-BR") : "-"}</strong>
                            </div>
                          </div>

                          <div className="quote-items-table">
                            <div className="quote-items-row quote-items-header">
                              <span>Item</span>
                              <span>Qtd.</span>
                              <span>Preco unit.</span>
                              <span>Desconto</span>
                              <span>Frete</span>
                              <span>Total</span>
                            </div>

                            {quote.items.map((quoteItem) => {
                              const unitPrice = decimalToNumber(quoteItem.unitPrice);
                              const range = group.priceRangeByRequestItem.get(quoteItem.purchaseRequestItemId);
                              const priceClass =
                                range && range.max > range.min && unitPrice === range.min
                                  ? "price-status low"
                                  : range && range.max > range.min && unitPrice === range.max
                                    ? "price-status high"
                                    : "price-status mid";

                              return (
                                <div className="quote-items-row" key={quoteItem.id}>
                                  <div>
                                    <strong>{quoteItem.item.code}</strong>
                                    <small>{quoteItem.item.description}</small>
                                  </div>
                                  <span className="mono">
                                    {decimalToNumber(quoteItem.quantity).toLocaleString("pt-BR")} {quoteItem.item.unit.code}
                                  </span>
                                  <span className={priceClass}>
                                    {formatCurrency(quoteItem.unitPrice)}
                                  </span>
                                  <span className="mono">{formatCurrency(quoteItem.discountValue)}</span>
                                  <span className="mono">{formatCurrency(quoteItem.freightCost)}</span>
                                  <strong className="mono">{formatCurrency(quoteItem.totalValue)}</strong>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <aside className="supplier-quote-side">
                          <div className="quote-total-box">
                            <span>Total final</span>
                            <strong>{formatCurrency(quote.totalValue)}</strong>
                            {isWinner ? <small>Menor custo do mapa</small> : <small>Comparar prazo e condicao</small>}
                          </div>

                          <div className="quote-cost-breakdown">
                            <div>
                              <span>Itens</span>
                              <strong>{formatCurrency(itemsTotal)}</strong>
                            </div>
                            <div>
                              <span>Descontos</span>
                              <strong>{formatCurrency(totalDiscount)}</strong>
                            </div>
                            <div>
                              <span>Frete geral</span>
                              <strong>{formatCurrency(generalFreight)}</strong>
                            </div>
                          </div>

                          <div className="quote-card-actions">
                            <PurchaseQuoteActions
                              quoteId={quote.id}
                              status={quote.status}
                              hasOrder={Boolean(quote.purchaseOrder)}
                              suppliers={supplierOptions}
                              editData={buildEditData(quote)}
                              variant="decision"
                            />
                          </div>
                        </aside>
                      </article>
                    );
                  })}
                </div>
              </article>
            ))}

            {quoteGroups.length === 0 ? (
              <article className="card accent-gray">
                <p className="eyebrow">Mapa comparativo</p>
                <h2>Nenhuma cotacao para comparar ainda.</h2>
                <p className="metric-sub">Crie uma cotacao com dois ou tres fornecedores para liberar a analise de vencedor.</p>
              </article>
            ) : null}
            <PaginationControls
              pathname="/suprimentos/cotacoes"
              params={params}
              meta={mapPaginationMeta}
              pageParam="mapaPage"
            />
          </section>
        }
        list={
          <section className="supply-record-section">
            <div className="table-header">
              <div>
                <p className="eyebrow">Cotacoes</p>
                <h2>Lista e ajustes</h2>
              </div>
              <span className="badge blue">{quotesCount} registros</span>
            </div>
            <div className="supply-record-stack">
              {quotes.map((quote) => {
                const itemsTotal = quote.items.reduce((sum, item) => sum + decimalToNumber(item.totalValue), 0);

                return (
                  <article className="supply-record-card" key={quote.id}>
                    <div className="supply-record-main">
                      <div className="supply-record-title">
                        <div>
                          <p className="eyebrow">Cotacao</p>
                          <h3 className="mono">{quote.number}</h3>
                          <span className="metric-sub">Solicitacao {quote.purchaseRequest.number} | {quote.supplier.name}</span>
                        </div>
                        <span className={quoteBadgeClass(quote.status)}>{quoteStatusLabels[quote.status] || quote.status}</span>
                      </div>

                      <div className="quote-meta-grid">
                        <div>
                          <span>Itens</span>
                          <strong>{formatCurrency(itemsTotal)}</strong>
                        </div>
                        <div>
                          <span>Frete</span>
                          <strong>{formatCurrency(quote.freightCost)}</strong>
                        </div>
                        <div>
                          <span>Entrega</span>
                          <strong>{quote.deliveryDays === null ? "-" : `${quote.deliveryDays} dias`}</strong>
                        </div>
                      </div>

                      <div className="supply-item-list-card">
                        {quote.items.length > 0 ? quote.items.map((quoteItem) => (
                          <span className="daily-item-pill" key={quoteItem.id}>
                            {quoteItem.item.code}: {decimalToNumber(quoteItem.quantity).toLocaleString("pt-BR")} {quoteItem.item.unit.code} - {formatCurrency(quoteItem.totalValue)}
                          </span>
                        )) : <span className="metric-sub">Sem item</span>}
                      </div>
                    </div>

                    <aside className="supply-record-actions">
                      <div className="quote-total-box">
                        <span>Total cotado</span>
                        <strong>{formatCurrency(quote.totalValue)}</strong>
                        <small>{quote.createdBy.name}</small>
                      </div>
                      <PurchaseQuoteActions
                        quoteId={quote.id}
                        status={quote.status}
                        hasOrder={Boolean(quote.purchaseOrder)}
                        suppliers={supplierOptions}
                        editData={buildEditData(quote)}
                        variant="decision"
                      />
                    </aside>
                  </article>
                );
              })}
              {quotes.length === 0 ? (
                <article className="card accent-gray">
                  <p className="eyebrow">Cotacoes</p>
                  <h2>Nenhuma cotacao registrada ainda.</h2>
                </article>
              ) : null}
            </div>
            <PaginationControls
              pathname="/suprimentos/cotacoes"
              params={params}
              meta={quotePaginationMeta}
              pageParam="cotacoesPage"
            />
          </section>
        }
      />
    </>
  );
}
