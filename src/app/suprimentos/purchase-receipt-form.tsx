"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

type OrderItemOption = {
  id: string;
  orderNumber: string;
  item: string;
  pendingQuantity: number;
  unitCode: string;
};

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  orderItems: OrderItemOption[];
  warehouses: WarehouseOption[];
};

export function PurchaseReceiptForm({ orderItems, warehouses }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const nextNumber = useMemo(() => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `REC-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch("/api/suprimentos/recebimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel registrar o recebimento.");
      return;
    }

    setSuccess("Recebimento conferido e entrada gerada no estoque.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero do recebimento</span>
        <input className="form-input mono" name="number" defaultValue={nextNumber} required />
      </label>

      <label className="field">
        <span>Item do pedido</span>
        <select className="form-input" name="purchaseOrderItemId" required defaultValue="">
          <option value="" disabled>Selecione</option>
          {orderItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.orderNumber} - {item.item} | pendente {item.pendingQuantity.toLocaleString("pt-BR")} {item.unitCode}
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

      <div className="form-two">
        <label className="field">
          <span>Qtd. recebida</span>
          <input className="form-input mono" name="receivedQuantity" type="number" min="0.001" step="0.001" required />
        </label>
        <label className="field">
          <span>Qtd. aceita</span>
          <input className="form-input mono" name="acceptedQuantity" type="number" min="0.001" step="0.001" required />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>NF / documento</span>
          <input className="form-input mono" name="invoiceNumber" maxLength={80} placeholder="NF-000123" />
        </label>
        <label className="field">
          <span>Data recebimento</span>
          <input className="form-input mono" name="receivedAt" type="date" />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Lote interno</span>
          <input className="form-input mono" name="lotCode" maxLength={80} placeholder="LOT-CP-001" />
        </label>
        <label className="field">
          <span>Lote fornecedor</span>
          <input className="form-input mono" name="supplierLot" maxLength={80} />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Fabricado em</span>
          <input className="form-input mono" name="manufacturedAt" type="date" />
        </label>
        <label className="field">
          <span>Validade</span>
          <input className="form-input mono" name="expiresAt" type="date" />
        </label>
      </div>

      <label className="field">
        <span>Observacao da conferencia</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Avaria, sobra, falta, laudo ou observacao da descarga..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || orderItems.length === 0 || warehouses.length === 0}>
        <PackageCheck size={17} />
        {loading ? "Conferindo..." : "Conferir e dar entrada"}
      </button>
    </form>
  );
}
