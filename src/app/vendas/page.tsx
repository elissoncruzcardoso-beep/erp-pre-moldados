import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, ReceiptText, ShoppingCart, WalletCards } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatMoney } from "@/lib/formatters";
import { FORM_OPTION_LIMIT, RECENT_RECORD_LIMIT, STOCK_BALANCE_LIMIT } from "@/lib/query-limits";
import { parseSaleLines } from "@/lib/sales/parse-sale-lines";
import { StockSaleForm } from "../estoque/stock-sale-form";
import { DirectSaleActions } from "../estoque/venda-direta/direct-sale-actions";

export const dynamic = "force-dynamic";

export default async function VendasPage() {
  const session = await requirePageSession({
    nextPath: "/vendas",
    permissions: ["estoque.view", "estoque.move"]
  });

  const prisma = getPrisma();
  const [items, warehouses, balances, directSales, customers, paymentMethods] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        controlsStock: true,
        type: {
          in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"]
        }
      },
      include: { unit: true },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.stockBalance.findMany({
      where: {
        quantity: { gt: 0 },
        item: {
          type: {
            in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"]
          }
        }
      },
      include: {
        item: { include: { unit: true } },
        warehouse: true
      },
      orderBy: [{ item: { code: "asc" } }, { warehouse: { code: "asc" } }],
      take: STOCK_BALANCE_LIMIT
    }),
    prisma.directSale.findMany({
      include: {
        item: { include: { unit: true } },
        warehouse: true,
        createdBy: true,
        accountsReceivable: {
          include: { receipts: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { issuedAt: "desc" },
      take: RECENT_RECORD_LIMIT
    }),
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.paymentMethod.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: FORM_OPTION_LIMIT
    })
  ]);

  const balanceMap = new Map<string, {
    id: string;
    itemId: string;
    warehouseId: string;
    quantity: number;
    item: (typeof balances)[number]["item"];
    warehouse: (typeof balances)[number]["warehouse"];
  }>();

  balances.forEach((balance) => {
    const key = `${balance.itemId}:${balance.warehouseId}`;
    const current = balanceMap.get(key);

    if (current) {
      current.quantity += decimalToNumber(balance.quantity);
      return;
    }

    balanceMap.set(key, {
      id: key,
      itemId: balance.itemId,
      warehouseId: balance.warehouseId,
      quantity: decimalToNumber(balance.quantity),
      item: balance.item,
      warehouse: balance.warehouse
    });
  });

  const consolidatedBalances = Array.from(balanceMap.values())
    .filter((balance) => balance.quantity > 0)
    .sort((a, b) => {
      const itemCompare = a.item.code.localeCompare(b.item.code);
      return itemCompare || a.warehouse.code.localeCompare(b.warehouse.code);
    });
  const availablePieces = consolidatedBalances.reduce((total, balance) => total + balance.quantity, 0);
  const activeSales = directSales.filter((sale) => sale.status === "ATIVA");
  const soldTotal = activeSales.reduce((total, sale) => total + decimalToNumber(sale.finalTotal), 0);
  const openReceivables = directSales.filter((sale) => sale.accountsReceivable[0]?.status !== "RECEBIDO" && sale.status === "ATIVA").length;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Vendas</p>
          <h1>Venda direta</h1>
          <p className="lead">
            Registre a venda de pecas prontas, baixe o estoque, gere recibo e alimente o contas a
            receber em uma unica tela.
          </p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/financeiro/contas-receber">
            <WalletCards size={16} />
            Contas a receber
          </Link>
          <span className="status-pill">
            <ClipboardCheck size={16} />
            Operador: {session.name}
          </span>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Clientes</span><ReceiptText size={22} /></div>
          <strong className="metric-value">{customers.length}</strong>
          <span className="metric-sub">Disponiveis para emitir recibo</span>
        </article>
        <article className="metric-card accent-green span-3">
          <div className="metric-top"><span className="mono">Saldo para venda</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{availablePieces.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</strong>
          <span className="metric-sub">Unidades somadas nos depositos</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Vendas recentes</span><ReceiptText size={22} /></div>
          <strong className="metric-value">{formatMoney(soldTotal)}</strong>
          <span className="metric-sub">Valor dos recibos ativos listados</span>
        </article>
        <article className="metric-card accent-red span-3">
          <div className="metric-top"><span className="mono">A receber</span><WalletCards size={22} /></div>
          <strong className="metric-value">{openReceivables}</strong>
          <span className="metric-sub">Titulos de venda ainda nao recebidos</span>
        </article>
      </section>

      <section className="sales-flow-card">
        <article>
          <span>1</span>
          <strong>Escolha o cliente</strong>
          <small>Use clientes cadastrados para manter recibo e financeiro organizados.</small>
        </article>
        <article>
          <span>2</span>
          <strong>Informe produto e quantidade</strong>
          <small>O sistema valida saldo antes de confirmar a venda.</small>
        </article>
        <article>
          <span>3</span>
          <strong>Confirme valores</strong>
          <small>Ao salvar, gera recibo, baixa estoque e cria o financeiro.</small>
        </article>
      </section>

      <section className="grid-12">
        <section className="card accent-orange span-6">
          <p className="eyebrow">Nova venda</p>
          <h2>Registrar venda</h2>
          <p className="section-note">
            Preencha os campos na ordem. O recibo aparece na tela logo apos salvar.
          </p>
          <StockSaleForm
            items={items.map((item) => ({
              id: item.id,
              code: item.code,
              description: item.description,
              unitCode: item.unit.code
            }))}
            warehouses={warehouses.map((warehouse) => ({
              id: warehouse.id,
              code: warehouse.code,
              name: warehouse.name
            }))}
            customers={customers.map((customer) => ({
              id: customer.id,
              code: customer.code,
              name: customer.name,
              document: customer.document || ""
            }))}
            paymentMethods={paymentMethods.map((method) => ({
              id: method.id,
              code: method.code,
              name: method.name
            }))}
            balances={consolidatedBalances.map((balance) => ({
              itemId: balance.itemId,
              warehouseId: balance.warehouseId,
              quantity: balance.quantity,
              unitCode: balance.item.unit.code
            }))}
          />
        </section>

        <section className="table-shell span-6">
          <div className="table-header">
            <div>
              <p className="eyebrow">Disponivel para venda</p>
              <h2>Estoque de pecas prontas</h2>
            </div>
            <Link className="secondary-button" href="/estoque">
              Ver estoque
              <ArrowRight size={15} />
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Deposito</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedBalances.map((balance) => (
                <tr key={balance.id}>
                  <td>
                    <strong>{balance.item.description}</strong>
                    <small className="product-detail">{balance.item.code}</small>
                  </td>
                  <td>{balance.warehouse.code} - {balance.warehouse.name}</td>
                  <td className="mono">
                    {balance.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {balance.item.unit.code}
                  </td>
                </tr>
              ))}
              {consolidatedBalances.length === 0 ? (
                <tr>
                  <td colSpan={3}>Nenhum produto acabado com saldo registrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="table-shell span-12">
          <div className="table-header">
            <div>
              <p className="eyebrow">Historico</p>
              <h2>Ultimos recibos emitidos</h2>
            </div>
            <ShoppingCart size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Recibo</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Total</th>
                <th>Financeiro</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {directSales.map((sale) => {
                const receivable = sale.accountsReceivable[0];
                const saleLines = parseSaleLines(sale.consumedLots);

                return (
                  <tr key={sale.id}>
                    <td className="mono">{sale.issuedAt.toLocaleString("pt-BR")}</td>
                    <td className="mono">{sale.number}</td>
                    <td>{sale.customerName}</td>
                    <td>
                      {saleLines.length > 1 ? (
                        <>
                          <strong>{saleLines.length} itens no recibo</strong>
                          <small className="product-detail">
                            {saleLines.map((line) => `${line.itemCode}: ${decimalToNumber(line.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${line.unitCode}`).join(" | ")}
                          </small>
                        </>
                      ) : (
                        `${sale.item.code} - ${sale.item.description}`
                      )}
                    </td>
                    <td className="mono">
                      {saleLines.length > 1
                        ? `${saleLines.reduce((total, line) => total + decimalToNumber(line.quantity), 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} un.`
                        : `${decimalToNumber(sale.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${sale.item.unit.code}`}
                    </td>
                    <td className="mono">{formatMoney(decimalToNumber(sale.finalTotal))}</td>
                    <td>
                      {receivable ? (
                        <span className={receivable.status === "RECEBIDO" ? "badge green" : "badge orange"}>
                          {receivable.number} / {receivable.status}
                        </span>
                      ) : (
                        <span className="badge red">Sem titulo</span>
                      )}
                    </td>
                    <td>
                      <span className={sale.status === "ATIVA" ? "badge green" : "badge red"}>
                        {sale.status === "ATIVA" ? "Ativa" : "Cancelada"}
                      </span>
                    </td>
                    <td>
                      <DirectSaleActions
                        sale={{
                          id: sale.id,
                          number: sale.number,
                          customerName: sale.customerName,
                          customerDocument: sale.customerDocument || "",
                          unitPrice: sale.unitPrice.toString(),
                          discount: sale.discount.toString(),
                          finalTotal: sale.finalTotal.toString(),
                          paymentMethod: sale.paymentMethod || "",
                          note: sale.note || "",
                          status: sale.status,
                          itemCount: saleLines.length || 1,
                          receivableNumber: receivable?.number,
                          receivableStatus: receivable?.status,
                          receiptCount: receivable?.receipts.length || 0
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {directSales.length === 0 ? (
                <tr>
                  <td colSpan={9}>Nenhum recibo emitido ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
