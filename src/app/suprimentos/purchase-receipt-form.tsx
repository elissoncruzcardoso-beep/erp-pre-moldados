"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

type OrderItemOption = {
  id: string;
  item: string;
  pendingQuantity: number;
  unitCode: string;
  unitPrice: number;
  approvedUnitCost: number;
  approvedPendingTotal: number;
};

type OrderOption = {
  id: string;
  number: string;
  supplierName: string;
  totalValue: number;
  items: OrderItemOption[];
};

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  orders: OrderOption[];
  warehouses: WarehouseOption[];
};

type LineValues = Record<string, {
  receivedQuantity: number;
  acceptedQuantity: number;
  unitCost: number;
}>;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  });
}

export function PurchaseReceiptForm({ orders, warehouses }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id || "");
  const [lineValues, setLineValues] = useState<LineValues>({});

  const receiptPrefix = useMemo(() => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `REC-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
  }, []);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0];
  const expectedInvoiceTotal = selectedOrder?.items.reduce((sum, item) => sum + item.approvedPendingTotal, 0) ?? 0;
  const typedInvoiceTotal = selectedOrder?.items.reduce((sum, item) => {
    const values = lineValues[item.id];
    return sum + ((values?.acceptedQuantity ?? 0) * (values?.unitCost ?? item.approvedUnitCost));
  }, 0) ?? 0;
  const invoiceDifference = typedInvoiceTotal - expectedInvoiceTotal;
  const hasInvoiceDifference = Math.abs(invoiceDifference) > 0.01;

  useEffect(() => {
    if (!selectedOrder) {
      setLineValues({});
      return;
    }

    setLineValues(
      Object.fromEntries(
        selectedOrder.items.map((item) => [
          item.id,
          {
            receivedQuantity: item.pendingQuantity,
            acceptedQuantity: item.pendingQuantity,
            unitCost: item.approvedUnitCost
          }
        ])
      )
    );
  }, [selectedOrder]);

  function updateLineValue(itemId: string, field: keyof LineValues[string], value: string) {
    setLineValues((current) => ({
      ...current,
      [itemId]: {
        receivedQuantity: current[itemId]?.receivedQuantity ?? 0,
        acceptedQuantity: current[itemId]?.acceptedQuantity ?? 0,
        unitCost: current[itemId]?.unitCost ?? 0,
        [field]: Number(value || 0)
      }
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedOrder) {
      setError("Selecione um pedido com itens pendentes.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const items = selectedOrder.items.map((item) => ({
      purchaseOrderItemId: item.id,
      receivedQuantity: Number(formData.get(`receivedQuantity-${item.id}`) || 0),
      acceptedQuantity: Number(formData.get(`acceptedQuantity-${item.id}`) || 0),
      unitCost: Number(formData.get(`unitCost-${item.id}`) || item.approvedUnitCost),
      lotCode: String(formData.get(`lotCode-${item.id}`) || "").trim() || undefined,
      note: String(formData.get(`itemNote-${item.id}`) || "").trim() || undefined
    })).filter((item) => item.receivedQuantity > 0 || item.acceptedQuantity > 0);

    const payload = {
      purchaseOrderId: selectedOrder.id,
      receiptPrefix,
      warehouseId: String(formData.get("warehouseId") || ""),
      invoiceNumber: String(formData.get("invoiceNumber") || "").trim(),
      supplierLot: String(formData.get("supplierLot") || "").trim() || undefined,
      receivedAt: String(formData.get("receivedAt") || "") || undefined,
      note: String(formData.get("note") || "").trim() || undefined,
      items
    };

    setLoading(true);
    const response = await fetch("/api/suprimentos/recebimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel registrar a nota fiscal.");
      return;
    }

    setSuccess("Nota fiscal conferida, estoque atualizado e titulo de contas a pagar gerado.");
    form.reset();
    setSelectedOrderId(orders[0]?.id || "");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <div className="receipt-helper">
        <div>
          <span className="eyebrow">Codigo interno automatico</span>
          <strong className="mono">{receiptPrefix}</strong>
        </div>
        <p>Use o numero da nota fiscal como documento principal. O codigo interno separa as entradas de estoque geradas por item.</p>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Pedido de compra</span>
          <select className="form-input" value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} required>
            {orders.length === 0 ? <option value="">Nenhum pedido pendente</option> : null}
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.number} - {order.supplierName} - {order.items.length} item(ns)
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Deposito destino</span>
          <select className="form-input" name="warehouseId" required defaultValue="">
            <option value="" disabled>Selecione</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Numero da nota fiscal / documento</span>
          <input className="form-input mono" name="invoiceNumber" maxLength={80} placeholder="NF-000123" required />
        </label>
        <label className="field">
          <span>Data recebimento</span>
          <input className="form-input mono" name="receivedAt" type="date" />
        </label>
      </div>

      <label className="field">
        <span>Lote do fornecedor</span>
        <input className="form-input mono" name="supplierLot" maxLength={80} placeholder="Opcional, se vier na NF ou embalagem" />
      </label>

      {selectedOrder ? (
        <div className="receipt-items-box">
          <div className="receipt-items-head">
            <div>
              <p className="eyebrow">Itens aprovados no pedido</p>
              <h3>{selectedOrder.number} - {selectedOrder.supplierName}</h3>
            </div>
            <span className="badge blue">
              {selectedOrder.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>

          <div className={hasInvoiceDifference ? "invoice-compare-card warning" : "invoice-compare-card"}>
            <div>
              <span>Valor aprovado pendente</span>
              <strong>{formatCurrency(expectedInvoiceTotal)}</strong>
            </div>
            <div>
              <span>Valor da NF digitado</span>
              <strong>{formatCurrency(typedInvoiceTotal)}</strong>
            </div>
            <div>
              <span>Diferenca</span>
              <strong>{formatCurrency(invoiceDifference)}</strong>
            </div>
            {hasInvoiceDifference ? (
              <p>A NF esta diferente do pedido aprovado. Confira custo unitario, frete, desconto ou registre a justificativa na observacao.</p>
            ) : (
              <p>Valores conferem com o pedido aprovado, considerando desconto e frete proporcional.</p>
            )}
          </div>

          <div className="receipt-item-grid receipt-item-grid-head" aria-hidden="true">
            <span>Insumo</span>
            <span>Recebido</span>
            <span>Aceito</span>
            <span>Custo unit.</span>
            <span>Lote interno</span>
            <span>Obs.</span>
          </div>

          {selectedOrder.items.map((item) => (
            <div className="receipt-item-grid" key={item.id}>
              <div>
                <strong>{item.item}</strong>
                <small>
                  Pendente: {item.pendingQuantity.toLocaleString("pt-BR")} {item.unitCode}
                </small>
              </div>
              <label className="field compact-field">
                <span>Recebido</span>
                <input
                  className="form-input mono"
                  name={`receivedQuantity-${item.id}`}
                  type="number"
                  min="0"
                  max={item.pendingQuantity}
                  step="0.001"
                  value={lineValues[item.id]?.receivedQuantity ?? item.pendingQuantity}
                  onChange={(event) => updateLineValue(item.id, "receivedQuantity", event.target.value)}
                />
              </label>
              <label className="field compact-field">
                <span>Aceito</span>
                <input
                  className="form-input mono"
                  name={`acceptedQuantity-${item.id}`}
                  type="number"
                  min="0"
                  max={item.pendingQuantity}
                  step="0.001"
                  value={lineValues[item.id]?.acceptedQuantity ?? item.pendingQuantity}
                  onChange={(event) => updateLineValue(item.id, "acceptedQuantity", event.target.value)}
                />
              </label>
              <label className="field compact-field">
                <span>Custo liquido</span>
                <input
                  className="form-input mono"
                  name={`unitCost-${item.id}`}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={lineValues[item.id]?.unitCost ?? item.approvedUnitCost}
                  onChange={(event) => updateLineValue(item.id, "unitCost", event.target.value)}
                />
                <small className="field-hint">
                  Pedido: {formatCurrency(item.approvedUnitCost)} / {item.unitCode}
                </small>
              </label>
              <label className="field compact-field">
                <span>Lote</span>
                <input className="form-input mono" name={`lotCode-${item.id}`} maxLength={80} placeholder="LOT-..." />
              </label>
              <label className="field compact-field">
                <span>Obs.</span>
                <input className="form-input" name={`itemNote-${item.id}`} maxLength={240} placeholder="Ajuste, falta..." />
              </label>
            </div>
          ))}
        </div>
      ) : (
        <p className="auth-error">Nao ha pedidos com saldo pendente para receber.</p>
      )}

      <label className="field">
        <span>Observacao da conferencia</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Avaria, sobra, falta, laudo ou observacao da descarga..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || !selectedOrder || warehouses.length === 0}>
        <PackageCheck size={17} />
        {loading ? "Conferindo..." : "Conferir NF e dar entrada"}
      </button>
    </form>
  );
}
