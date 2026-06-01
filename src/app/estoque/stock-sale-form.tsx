"use client";

import { FormEvent, memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { SaleReceiptDocument } from "@/app/vendas/_components/sale-receipt-document";
import { formatMoney, formatQuantityWithUnit } from "@/lib/formatters";
import { formatValidationError } from "@/lib/validations/client";
import { stockSaleSchema } from "@/lib/validations/sales";

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

type BalanceOption = {
  itemId: string;
  warehouseId: string;
  quantity: number;
  unitCode: string;
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
  balances: BalanceOption[];
};

type SaleLineCardProps = {
  line: SaleLine;
  index: number;
  lineCount: number;
  items: StockItem[];
  selectedItem: StockItem | undefined;
  available: number;
  warehousesForItem: WarehouseOption[];
  defaultItemId: string;
  defaultWarehouseId: string;
  getItemTotalStock: (itemId: string) => number;
  getWarehouseLabel: (warehouse: WarehouseOption, itemId: string) => string;
  onUpdateLine: (id: string, field: keyof SaleLine, value: string) => void;
  onRemoveLine: (id: string) => void;
};

const SaleLineCard = memo(function SaleLineCard({
  line,
  index,
  lineCount,
  items,
  selectedItem,
  available,
  warehousesForItem,
  defaultItemId,
  defaultWarehouseId,
  getItemTotalStock,
  getWarehouseLabel,
  onUpdateLine,
  onRemoveLine
}: SaleLineCardProps) {
  const requestedQuantity = Number(line.quantity || 0);
  const hasStockIssue = requestedQuantity > 0 && requestedQuantity > available;
  const lineGrossTotal = requestedQuantity * Number(line.unitPrice || 0);
  const lineFinalTotal = Math.max(lineGrossTotal - Number(line.discount || 0), 0);
  const activeItemId = line.itemId || defaultItemId;

  return (
    <article className="sale-line-card">
      <div className="sale-line-head">
        <div>
          <strong>Item {index + 1}</strong>
          <small>{selectedItem?.code || "Selecione o produto"}</small>
        </div>
        <button className="icon-button danger" type="button" onClick={() => onRemoveLine(line.id)} disabled={lineCount === 1}>
          <Trash2 size={15} />
          Remover
        </button>
      </div>
      <div className="sale-line-product-grid">
        <label className="field">
          <span>Produto vendido</span>
          <select
            className="form-input"
            required
            value={activeItemId}
            onChange={(event) => onUpdateLine(line.id, "itemId", event.target.value)}
          >
          {items.map((item) => {
            const totalStock = getItemTotalStock(item.id);

            return (
            <option value={item.id} key={item.id} disabled={totalStock <= 0}>
              {item.code} - {item.description} ({totalStock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unitCode})
            </option>
            );
          })}
          </select>
        </label>
        <label className="field">
          <span>Deposito de saida</span>
          <select
            className="form-input"
            required
            value={line.warehouseId || defaultWarehouseId}
            onChange={(event) => onUpdateLine(line.id, "warehouseId", event.target.value)}
          >
            {warehousesForItem.map((warehouse) => (
              <option value={warehouse.id} key={warehouse.id}>
                {getWarehouseLabel(warehouse, activeItemId)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sale-line-values-grid">
        <label className="field">
          <span>Quantidade</span>
          <input
            className="form-input mono"
            type="number"
            min="0.001"
            step="0.001"
            value={line.quantity}
            onChange={(event) => onUpdateLine(line.id, "quantity", event.target.value)}
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
            onChange={(event) => onUpdateLine(line.id, "unitPrice", event.target.value)}
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
            onChange={(event) => onUpdateLine(line.id, "discount", event.target.value)}
          />
        </label>
      </div>
      <div className={hasStockIssue ? "sale-stock-warning danger" : "sale-stock-warning"}>
        <span>Saldo disponivel</span>
        <strong>{selectedItem ? formatQuantityWithUnit(available, selectedItem.unitCode) : "0 UN"}</strong>
        {hasStockIssue ? <small>Quantidade acima do saldo deste deposito.</small> : null}
      </div>
      <div className="sale-line-total">
        <span>{selectedItem ? formatQuantityWithUnit(line.quantity || 0, selectedItem.unitCode) : "Sem produto"}</span>
        <strong>{formatMoney(lineFinalTotal)}</strong>
      </div>
    </article>
  );
});

export function StockSaleForm({ items, warehouses, customers, paymentMethods, balances }: StockSaleFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const stockByLocation = useMemo(() => {
    const map = new Map<string, BalanceOption>();
    balances.forEach((balance) => {
      const key = `${balance.itemId}:${balance.warehouseId}`;
      const current = map.get(key);
      map.set(key, {
        ...balance,
        quantity: (current?.quantity || 0) + balance.quantity
      });
    });
    return map;
  }, [balances]);

  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((balance) => {
      map.set(balance.itemId, (map.get(balance.itemId) || 0) + balance.quantity);
    });
    return map;
  }, [balances]);

  const warehousesByItem = useMemo(() => {
    const idsByItem = new Map<string, Set<string>>();

    balances.forEach((balance) => {
      if (balance.quantity <= 0) return;
      const current = idsByItem.get(balance.itemId) || new Set<string>();
      current.add(balance.warehouseId);
      idsByItem.set(balance.itemId, current);
    });

    const map = new Map<string, WarehouseOption[]>();
    idsByItem.forEach((warehouseIds, itemId) => {
      map.set(itemId, warehouses.filter((warehouse) => warehouseIds.has(warehouse.id)));
    });

    return map;
  }, [balances, warehouses]);

  const defaultItemId = useMemo(() => {
    return items.find((item) => (stockByItem.get(item.id) || 0) > 0)?.id || items[0]?.id || "";
  }, [items, stockByItem]);

  const defaultWarehouseId = useMemo(() => {
    return balances.find((balance) => balance.itemId === defaultItemId && balance.quantity > 0)?.warehouseId || warehouses[0]?.id || "";
  }, [balances, defaultItemId, warehouses]);

  const [saleLines, setSaleLines] = useState<SaleLine[]>([
    { id: "line-1", itemId: defaultItemId, warehouseId: defaultWarehouseId, quantity: "", unitPrice: "", discount: "0" }
  ]);

  const totals = useMemo(() => {
    const grossTotal = saleLines.reduce((total, line) => total + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    const discountTotal = saleLines.reduce((total, line) => total + Number(line.discount || 0), 0);

    return {
      grossTotal,
      discountTotal,
      finalTotal: Math.max(grossTotal - discountTotal, 0)
    };
  }, [saleLines]);

  const getFirstWarehouseIdForItem = useCallback((itemId: string) => {
    return warehousesByItem.get(itemId)?.[0]?.id || defaultWarehouseId;
  }, [defaultWarehouseId, warehousesByItem]);

  const updateLine = useCallback((id: string, field: keyof SaleLine, value: string) => {
    setSaleLines((current) => current.map((line) => {
      if (line.id !== id) return line;

      if (field === "itemId") {
        return {
          ...line,
          itemId: value,
          warehouseId: getFirstWarehouseIdForItem(value)
        };
      }

      return { ...line, [field]: value };
    }));
  }, [getFirstWarehouseIdForItem]);

  const addLine = useCallback(() => {
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
  }, [defaultItemId, defaultWarehouseId]);

  const removeLine = useCallback((id: string) => {
    setSaleLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
  }, []);

  const getAvailable = useCallback((line: SaleLine) => {
    return stockByLocation.get(`${line.itemId}:${line.warehouseId}`)?.quantity ?? 0;
  }, [stockByLocation]);

  const getWarehouseLabel = useCallback((warehouse: WarehouseOption, itemId: string) => {
    const balance = stockByLocation.get(`${itemId}:${warehouse.id}`);
    const stock = balance ? formatQuantityWithUnit(balance.quantity, balance.unitCode) : "sem saldo";

    return `${warehouse.code} - ${warehouse.name} (${stock})`;
  }, [stockByLocation]);

  const getItemTotalStock = useCallback((itemId: string) => {
    return stockByItem.get(itemId) || 0;
  }, [stockByItem]);

  const getWarehousesForItem = useCallback((itemId: string) => {
    return warehousesByItem.get(itemId) || [];
  }, [warehousesByItem]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setReceipt(null);

    const invalidLine = saleLines.find((line) => {
      const requested = Number(line.quantity || 0);
      return requested <= 0 || requested > getAvailable(line);
    });

    if (invalidLine) {
      setError("Revise os itens: existe quantidade zerada ou maior que o saldo disponivel.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
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
    };
    const parsed = stockSaleSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      return;
    }

    setLoading(true);
    const response = await fetch("/api/estoque/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
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
          <div className="sale-customer-helper">
            <span>Cliente nao cadastrado?</span>
            <Link href="/cadastros/clientes">Cadastrar cliente</Link>
          </div>
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
            {saleLines.map((line, index) => (
              <SaleLineCard
                key={line.id}
                line={line}
                index={index}
                lineCount={saleLines.length}
                items={items}
                selectedItem={itemsById.get(line.itemId)}
                available={getAvailable(line)}
                warehousesForItem={getWarehousesForItem(line.itemId || defaultItemId)}
                defaultItemId={defaultItemId}
                defaultWarehouseId={defaultWarehouseId}
                getItemTotalStock={getItemTotalStock}
                getWarehouseLabel={getWarehouseLabel}
                onUpdateLine={updateLine}
                onRemoveLine={removeLine}
              />
            ))}
          </div>

          <button className="secondary-button" type="button" onClick={addLine}>
            <Plus size={16} />
            Adicionar produto
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
            <strong>{formatMoney(totals.grossTotal)}</strong>
          </div>
          <div>
            <span>Descontos</span>
            <strong>{formatMoney(totals.discountTotal)}</strong>
          </div>
          <div>
            <span>Total final</span>
            <strong>{formatMoney(totals.finalTotal)}</strong>
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

          <SaleReceiptDocument
            receiptNumber={receipt.receiptNumber}
            issuedAtLabel={receipt.issuedAtLabel}
            customerName={receipt.customerName}
            customerDocument={receipt.customerDocument}
            sellerName={receipt.sellerName}
            paymentMethod={receipt.paymentMethod}
            items={receipt.items && receipt.items.length > 0 ? receipt.items : [
              {
                itemCode: receipt.item.code,
                description: receipt.item.description,
                unitCode: receipt.item.unitCode,
                quantity: receipt.quantity,
                unitPrice: receipt.unitPrice,
                grossTotal: receipt.grossTotal
              }
            ]}
            discount={receipt.discount}
            finalTotal={receipt.finalTotal}
            note={receipt.note}
            financialTitle={receipt.financialTitle}
          />
        </section>
      ) : null}
    </div>
  );
}
