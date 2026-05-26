import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, PackageCheck, ReceiptText } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { StockSaleForm } from "../stock-sale-form";
import { DirectSaleActions } from "./direct-sale-actions";

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

export default async function VendaDiretaPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/estoque/venda-direta");
  }

  if (!session.permissions.includes("estoque.view") || !session.permissions.includes("estoque.move")) {
    redirect("/estoque");
  }

  const prisma = getPrisma();
  const [items, warehouses, balances, directSales, customers] = await Promise.all([
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
        createdBy: true
      },
      orderBy: { issuedAt: "desc" },
      take: 8
    }),
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    })
  ]);

  const availablePieces = balances.reduce((total, balance) => total + decimalToNumber(balance.quantity), 0);
  const soldMonthTotal = directSales
    .filter((sale) => sale.status === "ATIVA")
    .reduce((total, sale) => total + decimalToNumber(sale.finalTotal), 0);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Estoque / Venda direta</p>
          <h1>Venda direta com recibo</h1>
          <p className="lead">
            Registre a venda de pecas acabadas, baixe o saldo do estoque e gere um recibo profissional
            da NORDESTE INDUSTRIA DE PREMOLDADOS LTDA.
          </p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/estoque">
            <ArrowLeft size={16} />
            Voltar ao estoque
          </Link>
          <span className="status-pill">
            <ClipboardCheck size={16} />
            Operador: {session.name}
          </span>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-4">
          <div className="metric-top"><span className="mono">Produtos liberados</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{items.length}</strong>
          <span className="metric-sub">Pecas e produtos acabados disponiveis para venda</span>
        </article>
        <article className="metric-card accent-green span-4">
          <div className="metric-top"><span className="mono">Saldo total</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{availablePieces.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</strong>
          <span className="metric-sub">Unidades somadas nos depositos</span>
        </article>
        <article className="metric-card accent-orange span-4">
          <div className="metric-top"><span className="mono">Recibos recentes</span><ReceiptText size={22} /></div>
          <strong className="metric-value">{money(soldMonthTotal)}</strong>
          <span className="metric-sub">Valor dos ultimos recibos listados</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="card accent-orange span-5">
          <p className="eyebrow">Nova venda</p>
          <h2>Emitir recibo e baixar estoque</h2>
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
          />
        </section>

        <section className="table-shell span-7">
          <div className="table-header">
            <div>
              <p className="eyebrow">Produtos disponiveis</p>
              <h2>Saldo por deposito</h2>
            </div>
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
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Total</th>
                <th>Status</th>
                <th>Operador</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {directSales.map((sale) => (
                <tr key={sale.id}>
                  <td className="mono">{sale.issuedAt.toLocaleString("pt-BR")}</td>
                  <td className="mono">{sale.number}</td>
                  <td>{sale.item.code} - {sale.item.description}</td>
                  <td className="mono">
                    {decimalToNumber(sale.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sale.item.unit.code}
                  </td>
                  <td className="mono">{money(decimalToNumber(sale.finalTotal))}</td>
                  <td>
                    <span className={sale.status === "ATIVA" ? "badge green" : "badge red"}>
                      {sale.status === "ATIVA" ? "Ativa" : "Cancelada"}
                    </span>
                  </td>
                  <td>{sale.createdBy.name}</td>
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
              ))}
              {directSales.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nenhum recibo emitido ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
