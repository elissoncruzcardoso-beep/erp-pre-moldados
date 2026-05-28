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

type PaymentMethodOption = {
  id: string;
  code: string;
  name: string;
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
  items?: Array<{
    itemId: string;
    itemCode: string;
    description: string;
    unitCode: string;
    warehouse: string;
    quantity: string;
    unitPrice: string;
    grossTotal: string;
    discount: string;
    finalTotal: string;
  }>;
  quantity: string;
  unitPrice: string;
  grossTotal: string;
  discount: string;
  finalTotal: string;
  financialTitle: {
    number: string;
    status: string;
    dueDateLabel: string;
    receivedAmount: string;
  } | null;
};

type SaleLine = {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
};

type StockSaleFormProps = {
  items: StockItem[];
  warehouses: WarehouseOption[];
  customers: CustomerOption[];
  paymentMethods: PaymentMethodOption[];
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

export function StockSaleForm({ items, warehouses, customers, paymentMethods }: StockSaleFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const defaultItemId = useMemo(() => items[0]?.id || "", [items]);
  const defaultWarehouseId = useMemo(() => warehouses[0]?.id || "", [warehouses]);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([
    { id: "line-1", itemId: defaultItemId, warehouseId: defaultWarehouseId, quantity: "", unitPrice: "", discount: "0" }
  ]);
  const grossTotal = saleLines.reduce((total, line) => total + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const discountTotal = saleLines.reduce((total, line) => total + Number(line.discount || 0), 0);
  const finalTotal = Math.max(grossTotal - discountTotal, 0);

  function updateLine(id: string, field: keyof SaleLine, value: string) {
    setSaleLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    setSaleLines((current) => [
      ...current,
      {
        id: `line-${Date.now()}`,
        itemId: defaultItemId,
        warehouseId: defaultWarehouseId,
        quantity: "",
        unitPrice: "",
        discount: "0"
      }
    ]);
  }

  function removeLine(id: string) {
    setSaleLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
  }

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
        itemId: saleLines[0]?.itemId,
        warehouseId: saleLines[0]?.warehouseId,
        quantity: saleLines[0]?.quantity,
        unitPrice: saleLines[0]?.unitPrice,
        discount: saleLines[0]?.discount || 0,
        items: saleLines.map((line) => ({
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount || 0
        })),
        paymentMethod: formData.get("paymentMethod") || undefined,
        settleNow: formData.get("settleNow") === "on",
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
    setSaleLines([{ id: "line-1", itemId: defaultItemId, warehouseId: defaultWarehouseId, quantity: "", unitPrice: "", discount: "0" }]);
    router.refresh();
  }

  return (
    <div className="stock-sale-stack">
      <form className="product-form" onSubmit={handleSubmit}>
        <section className="sale-form-group">
          <div className="sale-form-title">
            <span>1</span>
            <div>
              <strong>Cliente</strong>
              <small>Selecione quem vai aparecer no recibo.</small>
            </div>
          </div>

        <div className="form-two">
          <label className="field">
            <span>Cliente cadastrado</span>
            <select
              className="form-input"
              name="customerId"
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
              required
            >
              <option value="" disabled>Selecione o cliente</option>
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
              value={selectedCustomer?.document || ""}
              readOnly
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
              value={selectedCustomer?.name || ""}
              readOnly
              onChange={() => undefined}
              required
            />
          </label>
          <label className="field">
            <span>Modo</span>
            <input className="form-input" value={selectedCustomer ? "Cliente cadastrado" : "Aguardando cliente"} readOnly />
          </label>
        </div>
        </section>

        <section className="sale-form-group">
          <div className="sale-form-title">
            <span>2</span>
            <div>
              <strong>Itens da venda</strong>
              <small>Adicione uma ou mais pecas no mesmo recibo.</small>
            </div>
          </div>

          <div className="sale-lines">
            {saleLines.map((line, index) => {
              const selectedItem = items.find((item) => item.id === line.itemId);
              const lineGrossTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
              const lineFinalTotal = Math.max(lineGrossTotal - Number(line.discount || 0), 0);

              return (
                <article className="sale-line-card" key={line.id}>
                  <div className="sale-line-head">
                    <strong>Item {index + 1}</strong>
                    <button className="icon-button danger" type="button" onClick={() => removeLine(line.id)} disabled={saleLines.length === 1}>
                      Remover
                    </button>
                  </div>
                  <label className="field">
                    <span>Produto vendido</span>
                    <select
                      className="form-input"
                      required
                      value={line.itemId || defaultItemId}
                      onChange={(event) => updateLine(line.id, "itemId", event.target.value)}
                    >
                      {items.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.code} - {item.description} ({item.unitCode})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Deposito de saida</span>
                    <select
                      className="form-input"
                      required
                      value={line.warehouseId || defaultWarehouseId}
                      onChange={(event) => updateLine(line.id, "warehouseId", event.target.value)}
                    >
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
                      <input
                        className="form-input mono"
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.id, "quantity", event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Preco unitario</span>
                      <input
                        className="form-input mono"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.id, "unitPrice", event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Desconto</span>
                      <input
                        className="form-input mono"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.discount}
                        onChange={(event) => updateLine(line.id, "discount", event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="sale-line-total">
                    <span>{selectedItem ? quantity(line.quantity || 0, selectedItem.unitCode) : "Sem produto"}</span>
                    <strong>{money(lineFinalTotal)}</strong>
                  </div>
                </article>
              );
            })}
          </div>

          <button className="secondary-button" type="button" onClick={addLine}>
            + Adicionar produto
          </button>
        </section>

        <section className="sale-form-group">
          <div className="sale-form-title">
            <span>3</span>
            <div>
              <strong>Resumo e pagamento</strong>
              <small>Confira o total antes de confirmar.</small>
            </div>
          </div>

        <div className="sale-total-preview">
          <div>
            <span>Total bruto</span>
            <strong>{money(grossTotal)}</strong>
          </div>
          <div>
            <span>Total final</span>
            <strong>{money(finalTotal)}</strong>
            <small>{saleLines.length} item(ns) no recibo</small>
          </div>
        </div>

        <div className="form-two">
          <label className="field">
            <span>Forma de pagamento</span>
            <select className="form-input" name="paymentMethod" defaultValue={paymentMethods[0]?.name || "PIX"} required>
              {paymentMethods.length === 0 ? <option value="PIX">PIX</option> : null}
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.name}>
                  {method.code} - {method.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observacao</span>
            <input className="form-input" name="note" placeholder="Opcional" maxLength={240} />
          </label>
        </div>
        </section>

        <label className="checkbox-line">
          <input type="checkbox" name="settleNow" defaultChecked />
          <span>Baixar financeiro automaticamente no ato da venda</span>
        </label>

        {error ? <p className="auth-error">{error}</p> : null}
        {message ? <p className="auth-success">{message}</p> : null}

        <button className="primary-button" type="submit" disabled={loading || items.length === 0 || warehouses.length === 0 || customers.length === 0}>
          <ShoppingCart size={17} />
          {loading ? "Gerando..." : "Confirmar venda"}
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
                {(receipt.items && receipt.items.length > 0 ? receipt.items : [
                  {
                    itemCode: receipt.item.code,
                    description: receipt.item.description,
                    unitCode: receipt.item.unitCode,
                    quantity: receipt.quantity,
                    unitPrice: receipt.unitPrice,
                    grossTotal: receipt.grossTotal
                  }
                ]).map((item, index) => (
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
                <strong>{money(receipt.discount)}</strong>
              </div>
              <div>
                <span>Total final</span>
                <strong>{money(receipt.finalTotal)}</strong>
              </div>
            </section>

            {receipt.financialTitle ? (
              <section className="sale-receipt-grid">
                <div>
                  <span>Titulo financeiro</span>
                  <strong>{receipt.financialTitle.number}</strong>
                  <small>Status: {receipt.financialTitle.status}</small>
                </div>
                <div>
                  <span>Vencimento</span>
                  <strong>{receipt.financialTitle.dueDateLabel}</strong>
                  <small>Gerado automaticamente</small>
                </div>
                <div>
                  <span>Baixa</span>
                  <strong>{money(receipt.financialTitle.receivedAmount)}</strong>
                  <small>Contas a receber</small>
                </div>
              </section>
            ) : null}

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
