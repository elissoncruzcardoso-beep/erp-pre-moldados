import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck, PackageCheck, ReceiptText, WalletCards } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { StockSaleForm } from "../estoque/stock-sale-form";
import { DirectSaleActions } from "../estoque/venda-direta/direct-sale-actions";

export const dynamic = "force-dynamic";

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default async function VendasPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/vendas");
  }

  if (!session.permissions.includes("estoque.view") || !session.permissions.includes("estoque.move")) {
    redirect("/dashboard");
  }

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
      orderBy: { code: "asc" }
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.stockBalance.findMany({
      where: {
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
      orderBy: [{ item: { code: "asc" } }, { warehouse: { code: "asc" } }]
    }),
    prisma.directSale.findMany({
      include: {
        item: { include: { unit: true } },
        warehouse: true,
        createdBy: true,
        accountsReceivable: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { issuedAt: "desc" },
      take: 12
    }),
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    }),
    prisma.paymentMethod.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    })
  ]);

  const availablePieces = balances.reduce((total, balance) => total + decimalToNumber(balance.quantity), 0);
  const activeSales = directSales.filter((sale) => sale.status === "ATIVA");
  const soldTotal = activeSales.reduce((total, sale) => total + decimalToNumber(sale.finalTotal), 0);
  const openReceivables = directSales.filter((sale) => sale.accountsReceivable[0]?.status !== "RECEBIDO" && sale.status === "ATIVA").length;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Vendas</p>
          <h1>Venda direta, recibo e financeiro</h1>
          <p className="lead">
            Emita venda de pecas prontas, baixe estoque, gere recibo profissional e crie automaticamente
            o contas a receber da operacao.
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
          <strong className="metric-value">{money(soldTotal)}</strong>
          <span className="metric-sub">Valor dos recibos ativos listados</span>
        </article>
        <article className="metric-card accent-red span-3">
          <div className="metric-top"><span className="mono">A receber</span><WalletCards size={22} /></div>
          <strong className="metric-value">{openReceivables}</strong>
          <span className="metric-sub">Titulos de venda ainda nao recebidos</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="card accent-orange span-5">
          <p className="eyebrow">Nova venda</p>
          <h2>Emitir recibo, baixar estoque e gerar financeiro</h2>
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
          />
        </section>

        <section className="table-shell span-7">
          <div className="table-header">
            <div>
              <p className="eyebrow">Produtos disponiveis</p>
              <h2>Saldo por deposito</h2>
            </div>
            <Link className="secondary-button" href="/estoque">
              Ver estoque
              <ArrowRight size={15} />
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Produto</th>
                <th>Deposito</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.id}>
                  <td className="mono">{balance.item.code}</td>
                  <td>{balance.item.description}</td>
                  <td>{balance.warehouse.code} - {balance.warehouse.name}</td>
                  <td className="mono">
                    {decimalToNumber(balance.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {balance.item.unit.code}
                  </td>
                </tr>
              ))}
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={4}>Nenhum produto acabado com saldo registrado.</td>
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

                return (
                  <tr key={sale.id}>
                    <td className="mono">{sale.issuedAt.toLocaleString("pt-BR")}</td>
                    <td className="mono">{sale.number}</td>
                    <td>{sale.customerName}</td>
                    <td>{sale.item.code} - {sale.item.description}</td>
                    <td className="mono">
                      {decimalToNumber(sale.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sale.item.unit.code}
                    </td>
                    <td className="mono">{money(decimalToNumber(sale.finalTotal))}</td>
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
                          customerName: sale.customerName,
                          customerDocument: sale.customerDocument || "",
                          unitPrice: sale.unitPrice.toString(),
                          discount: sale.discount.toString(),
                          paymentMethod: sale.paymentMethod || "",
                          note: sale.note || "",
                          status: sale.status
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
