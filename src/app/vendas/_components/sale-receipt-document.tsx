import { ReceiptText } from "lucide-react";
import { formatMoney, formatQuantityWithUnit } from "@/lib/formatters";

export type SaleReceiptDocumentItem = {
  itemCode: string;
  description: string;
  unitCode: string;
  quantity: string | number;
  unitPrice: string | number;
  grossTotal: string | number;
};

export type SaleReceiptFinancialTitle = {
  number: string;
  status: string;
  receivedAmount: string | number;
  dueDateLabel?: string;
};

type SaleReceiptDocumentProps = {
  companyName?: string;
  receiptNumber: string;
  issuedAtLabel: string;
  status?: string;
  customerName: string;
  customerDocument?: string | null;
  sellerName: string;
  paymentMethod?: string | null;
  items: SaleReceiptDocumentItem[];
  discount: string | number;
  finalTotal: string | number;
  note?: string | null;
  cancelReason?: string | null;
  financialTitle?: SaleReceiptFinancialTitle | null;
};

export function SaleReceiptDocument({
  companyName = "NORDESTE INDUSTRIA DE PREMOLDADOS LTDA",
  receiptNumber,
  issuedAtLabel,
  status,
  customerName,
  customerDocument,
  sellerName,
  paymentMethod,
  items,
  discount,
  finalTotal,
  note,
  cancelReason,
  financialTitle
}: SaleReceiptDocumentProps) {
  return (
    <article className="sale-receipt">
      <header className="sale-receipt-header">
        <div>
          <p className="eyebrow">{companyName}</p>
          <h2>Recibo de venda</h2>
          {status === "CANCELADA" ? <span className="badge red">Cancelado</span> : null}
        </div>
        <div className="sale-receipt-number">
          <ReceiptText size={22} />
          <strong>{receiptNumber}</strong>
          <span>{issuedAtLabel}</span>
        </div>
      </header>

      <section className="sale-receipt-grid">
        <div>
          <span>Cliente</span>
          <strong>{customerName}</strong>
          <small>{customerDocument || "Documento nao informado"}</small>
        </div>
        <div>
          <span>Vendedor</span>
          <strong>{sellerName}</strong>
          <small>{paymentMethod || "Nao informado"}</small>
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
          {items.map((item, index) => (
            <tr key={`${item.itemCode}-${index}`}>
              <td className="mono">{item.itemCode}</td>
              <td>{item.description}</td>
              <td>{formatQuantityWithUnit(item.quantity, item.unitCode)}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.grossTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="sale-receipt-total">
        <div>
          <span>Desconto</span>
          <strong>{formatMoney(discount)}</strong>
        </div>
        <div>
          <span>Total final</span>
          <strong>{formatMoney(finalTotal)}</strong>
        </div>
      </section>

      {financialTitle ? (
        <section className="sale-receipt-grid">
          <div>
            <span>Titulo financeiro</span>
            <strong>{financialTitle.number}</strong>
            <small>Status: {financialTitle.status}</small>
          </div>
          {financialTitle.dueDateLabel ? (
            <div>
              <span>Vencimento</span>
              <strong>{financialTitle.dueDateLabel}</strong>
              <small>Gerado automaticamente</small>
            </div>
          ) : null}
          <div>
            <span>{financialTitle.dueDateLabel ? "Baixa" : "Valor recebido"}</span>
            <strong>{formatMoney(financialTitle.receivedAmount)}</strong>
            <small>Contas a receber</small>
          </div>
        </section>
      ) : null}

      {note ? <p className="sale-receipt-note">{note}</p> : null}
      {cancelReason ? <p className="sale-receipt-note">Cancelamento: {cancelReason}</p> : null}

      <footer className="sale-receipt-footer">
        <div className="sale-signatures">
          <div>
            <span />
            <strong>Assinatura do cliente</strong>
          </div>
          <div>
            <span />
            <strong>{companyName}</strong>
          </div>
        </div>
        <p>Recebemos o valor referente aos produtos descritos acima. Documento gerado automaticamente pelo PRECAST ERP.</p>
      </footer>
    </article>
  );
}
