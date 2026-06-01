import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SaleReceiptDocument } from "@/app/vendas/_components/sale-receipt-document";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { parseSaleLines } from "@/lib/sales/parse-sale-lines";
import { PrintReceiptButton } from "../print-receipt-button";

export const dynamic = "force-dynamic";

export default async function ReciboVendaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession({
    nextPath: "/vendas",
    permission: "estoque.view",
    forbiddenPath: "/estoque"
  });

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
        <SaleReceiptDocument
          receiptNumber={sale.number}
          issuedAtLabel={sale.issuedAt.toLocaleString("pt-BR")}
          status={sale.status}
          customerName={sale.customerName}
          customerDocument={sale.customerDocument}
          sellerName={sale.createdBy.name}
          paymentMethod={sale.paymentMethod}
          items={receiptItems}
          discount={sale.discount.toString()}
          finalTotal={sale.finalTotal.toString()}
          note={sale.note}
          cancelReason={sale.cancelReason}
        />
      </section>
    </>
  );
}
