"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, ReceiptText, ShoppingCart } from "lucide-react";

type StockItem = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
};

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

type CustomerOption = {
  id: string;
  code: string;
  name: string;
  document: string;
};

type SaleReceipt = {
  id: string;
  receiptNumber: string;
  issuedAtLabel: string;
  sellerName: string;
  customerName: string;
  customerDocument: string;
  paymentMethod: string;
  note: string;
  warehouse: string;
  item: StockItem;
  quantity: string;
  unitPrice: string;
  grossTotal: string;
  discount: string;
  finalTotal: string;
};

type StockSaleFormProps = {
  items: StockItem[];
  warehouses: WarehouseOption[];
  customers: CustomerOption[];
};

function money(value: string | number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function quantity(value: string | number, unitCode: string) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  })} ${unitCode}`;
}

export function StockSaleForm({ items, warehouses, customers }: StockSaleFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const defaultItemId = useMemo(() => items[0]?.id || "", [items]);
  const defaultWarehouseId = useMemo(() => warehouses[0]?.id || "", [warehouses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setReceipt(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/estoque/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: formData.get("customerId") || undefined,
        customerName: formData.get("customerName"),
        customerDocument: formData.get("customerDocument") || undefined,
        itemId: formData.get("itemId"),
        warehouseId: formData.get("warehouseId"),
        quantity: formData.get("quantity"),
        unitPrice: formData.get("unitPrice"),
        discount: formData.get("discount") || 0,
        paymentMethod: formData.get("paymentMethod") || undefined,
        note: formData.get("note") || undefined
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel registrar a venda.");
      return;
    }

    setReceipt(data.receipt);
    setMessage("Venda registrada e recibo gerado.");
    form.reset();
    setSelectedCustomerId("");
    router.refresh();
  }

  return (
    <div className="stock-sale-stack">
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-two">
          <label className="field">
            <span>Cliente cadastrado</span>
            <select
              className="form-input"
              name="customerId"
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
            >
              <option value="">Cliente avulso</option>
              {customers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.code} - {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>CPF/CNPJ</span>
            <input
              className="form-input mono"
              name="customerDocument"
              placeholder="Opcional"
              maxLength={40}
              value={selectedCustomer?.document || undefined}
              readOnly={Boolean(selectedCustomer)}
              onChange={() => undefined}
            />
          </label>
        </div>

        <div className="form-two">
          <label className="field">
            <span>Cliente</span>
            <input
              className="form-input"
              name="customerName"
              placeholder="Nome do cliente"
              maxLength={120}
              value={selectedCustomer?.name || undefined}
              readOnly={Boolean(selectedCustomer)}
              onChange={() => undefined}
              required
            />
          </label>
          <label className="field">
            <span>Modo</span>
            <input className="form-input" value={selectedCustomer ? "Cliente cadastrado" : "Cliente avulso"} readOnly />
          </label>
        </div>

        <label className="field">
          <span>Produto vendido</span>
          <select className="form-input" name="itemId" required defaultValue={defaultItemId}>
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.code} - {item.description} ({item.unitCode})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Deposito de saida</span>
          <select className="form-input" name="warehouseId" required defaultValue={defaultWarehouseId}>
            {warehouses.map((warehouse) => (
              <option value={warehouse.id} key={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>

        <div className="form-three">
          <label className="field">
            <span>Quantidade</span>
            <input className="form-input mono" name="quantity" type="number" min="0.001" step="0.001" required />
          </label>
          <label className="field">
            <span>Preco unitario</span>
            <input className="form-input mono" name="unitPrice" type="number" min="0" step="0.01" required />
          </label>
          <label className="field">
            <span>Desconto</span>
            <input className="form-input mono" name="discount" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
        </div>

        <div className="form-two">
          <label className="field">
            <span>Forma de pagamento</span>
            <input className="form-input" name="paymentMethod" placeholder="Pix, dinheiro, boleto..." maxLength={60} />
          </label>
          <label className="field">
            <span>Observacao</span>
            <input className="form-input" name="note" placeholder="Opcional" maxLength={240} />
          </label>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {message ? <p className="auth-success">{message}</p> : null}

        <button className="primary-button" type="submit" disabled={loading || items.length === 0 || warehouses.length === 0}>
          <ShoppingCart size={17} />
          {loading ? "Gerando..." : "Registrar venda e recibo"}
        </button>
      </form>

      {receipt ? (
        <section className="sale-receipt-panel">
          <div className="sale-receipt-actions">
            <div>
              <p className="eyebrow">Recibo gerado</p>
              <h3>{receipt.receiptNumber}</h3>
            </div>
            <button className="secondary-button" type="button" onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir PDF
            </button>
          </div>

          <article className="sale-receipt">
            <header className="sale-receipt-header">
              <div>
                <p className="eyebrow">NORDESTE INDUSTRIA DE PREMOLDADOS LTDA</p>
                <h2>Recibo de venda</h2>
              </div>
              <div className="sale-receipt-number">
                <ReceiptText size={22} />
                <strong>{receipt.receiptNumber}</strong>
                <span>{receipt.issuedAtLabel}</span>
              </div>
            </header>

            <section className="sale-receipt-grid">
              <div>
                <span>Cliente</span>
                <strong>{receipt.customerName}</strong>
                <small>{receipt.customerDocument || "Documento nao informado"}</small>
              </div>
              <div>
                <span>Vendedor</span>
                <strong>{receipt.sellerName}</strong>
                <small>{receipt.paymentMethod}</small>
              </div>
              <div>
                <span>Deposito</span>
                <strong>{receipt.warehouse}</strong>
                <small>Baixa automatica do estoque</small>
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
                <tr>
                  <td className="mono">{receipt.item.code}</td>
                  <td>{receipt.item.description}</td>
                  <td>{quantity(receipt.quantity, receipt.item.unitCode)}</td>
                  <td>{money(receipt.unitPrice)}</td>
                  <td>{money(receipt.grossTotal)}</td>
                </tr>
              </tbody>
            </table>

            <section className="sale-receipt-total">
              <div>
                <span>Desconto</span>
                <strong>{money(receipt.discount)}</strong>
              </div>
              <div>
                <span>Total final</span>
                <strong>{money(receipt.finalTotal)}</strong>
              </div>
            </section>

            {receipt.note ? <p className="sale-receipt-note">{receipt.note}</p> : null}

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
      ) : null}
    </div>
  );
}
