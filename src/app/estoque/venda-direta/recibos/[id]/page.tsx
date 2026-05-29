import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { PrintReceiptButton } from "../print-receipt-button";

export const dynamic = "force-dynamic";

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function money(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function quantity(value: unknown, unitCode: string) {
  return `${decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  })} ${unitCode}`;
}

function parseSaleLines(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const saleItems = (value as Record<string, unknown>).saleItems;
  if (!Array.isArray(saleItems)) return [];

  return saleItems
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const record = line as Record<string, unknown>;
      return {
        itemCode: String(record.itemCode || ""),
        description: String(record.description || ""),
        unitCode: String(record.unitCode || "UN"),
        quantity: String(record.quantity || "0"),
        unitPrice: String(record.unitPrice || "0"),
        grossTotal: String(record.grossTotal || "0")
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
}

export default async function ReciboVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/vendas");
  }

  if (!session.permissions.includes("estoque.view")) {
    redirect("/estoque");
  }

  const { id } = await params;
  const prisma = getPrisma();
  const sale = await prisma.directSale.findUnique({
    where: { id },
    include: {
      item: { include: { unit: true } },
      warehouse: true,
      createdBy: true,
      cancelledBy: true
    }
  });

  if (!sale) {
    notFound();
  }

  const saleLines = parseSaleLines(sale.consumedLots);
  const receiptItems =
    saleLines.length > 0
      ? saleLines
      : [
          {
            itemCode: sale.item.code,
            description: sale.item.description,
            unitCode: sale.item.unit.code,
            quantity: sale.quantity.toString(),
            unitPrice: sale.unitPrice.toString(),
            grossTotal: sale.grossTotal.toString()
          }
        ];

  return (
    <>
      <section className="page-head no-print">
        <div>
          <p className="eyebrow">Venda direta / Recibo</p>
          <h1>{sale.number}</h1>
          <p className="lead">Recibo profissional para impressão ou salvamento em PDF.</p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/vendas">
            <ArrowLeft size={16} />
            Voltar
          </Link>
          <PrintReceiptButton />
        </div>
      </section>

      <section className="sale-receipt-page">
        <article className="sale-receipt">
          <header className="sale-receipt-header">
            <div>
              <p className="eyebrow">NORDESTE INDUSTRIA DE PREMOLDADOS LTDA</p>
              <h2>Recibo de venda</h2>
              {sale.status === "CANCELADA" ? <span className="badge red">Cancelado</span> : null}
            </div>
            <div className="sale-receipt-number">
              <ReceiptText size={22} />
              <strong>{sale.number}</strong>
              <span>{sale.issuedAt.toLocaleString("pt-BR")}</span>
            </div>
          </header>

          <section className="sale-receipt-grid">
            <div>
              <span>Cliente</span>
              <strong>{sale.customerName}</strong>
              <small>{sale.customerDocument || "Documento nao informado"}</small>
            </div>
            <div>
              <span>Vendedor</span>
              <strong>{sale.createdBy.name}</strong>
              <small>{sale.paymentMethod || "Nao informado"}</small>
            </div>
          </section>

          <table className="sale-receipt-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Preco unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {receiptItems.map((item, index) => (
                <tr key={`${item.itemCode}-${index}`}>
                  <td className="mono">{item.itemCode}</td>
                  <td>{item.description}</td>
                  <td>{quantity(item.quantity, item.unitCode)}</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{money(item.grossTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="sale-receipt-total">
            <div>
              <span>Desconto</span>
              <strong>{money(sale.discount)}</strong>
            </div>
            <div>
              <span>Total final</span>
              <strong>{money(sale.finalTotal)}</strong>
            </div>
          </section>

          {sale.note ? <p className="sale-receipt-note">{sale.note}</p> : null}
          {sale.cancelReason ? <p className="sale-receipt-note">Cancelamento: {sale.cancelReason}</p> : null}

          <footer className="sale-receipt-footer">
            <div className="sale-signatures">
              <div>
                <span />
                <strong>Assinatura do cliente</strong>
              </div>
              <div>
                <span />
                <strong>NORDESTE INDUSTRIA DE PREMOLDADOS LTDA</strong>
              </div>
            </div>
            <p>Recebemos o valor referente aos produtos descritos acima. Documento gerado automaticamente pelo PRECAST ERP.</p>
          </footer>
        </article>
      </section>
    </>
  );
}
