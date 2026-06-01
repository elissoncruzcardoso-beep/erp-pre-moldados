"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import { formatValidationError } from "@/lib/validations/client";
import { stockMovementSchema } from "@/lib/validations/stock";

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

type StockMovementFormProps = {
  items: StockItem[];
  warehouses: WarehouseOption[];
};

const movementTypes = [
  ["ENTRADA_COMPRA", "Entrada por compra"],
  ["SAIDA_PRODUCAO", "Saida para producao"],
  ["ENTRADA_PRODUCAO", "Entrada de producao"],
  ["TRANSFERENCIA", "Transferencia"],
  ["AJUSTE_POSITIVO", "Ajuste positivo"],
  ["AJUSTE_NEGATIVO", "Ajuste negativo"],
  ["RESERVA", "Reserva"]
];

export function StockMovementForm({ items, warehouses }: StockMovementFormProps) {
  const router = useRouter();
  const [type, setType] = useState("ENTRADA_COMPRA");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const needsOrigin = ["SAIDA_PRODUCAO", "AJUSTE_NEGATIVO", "RESERVA", "TRANSFERENCIA"].includes(type);
  const needsTarget = ["ENTRADA_COMPRA", "ENTRADA_PRODUCAO", "AJUSTE_POSITIVO", "TRANSFERENCIA"].includes(type);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      type,
      itemId: formData.get("itemId"),
      quantity: formData.get("quantity"),
      unitCost: formData.get("unitCost") || 0,
      originWarehouseId: formData.get("originWarehouseId") || undefined,
      targetWarehouseId: formData.get("targetWarehouseId") || undefined,
      document: formData.get("document") || undefined,
      justification: formData.get("justification") || undefined
    };
    const parsed = stockMovementSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      return;
    }

    setLoading(true);
    const response = await fetch("/api/estoque/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel registrar a movimentacao.");
      return;
    }

    event.currentTarget.reset();
    setType("ENTRADA_COMPRA");
    setMessage("Movimentacao registrada com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Tipo</span>
        <select className="form-input" value={type} onChange={(event) => setType(event.target.value)}>
          {movementTypes.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Item</span>
        <select className="form-input" name="itemId" required defaultValue={items[0]?.id || ""}>
          {items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.code} - {item.description} ({item.unitCode})
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Quantidade</span>
          <input className="form-input mono" name="quantity" type="number" min="0.001" step="0.001" required />
        </label>
        <label className="field">
          <span>Custo unitario</span>
          <input className="form-input mono" name="unitCost" type="number" min="0" step="0.0001" defaultValue="0" />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Origem</span>
          <select className="form-input" name="originWarehouseId" required={needsOrigin} disabled={!needsOrigin} defaultValue="">
            <option value="">Nao se aplica</option>
            {warehouses.map((warehouse) => (
              <option value={warehouse.id} key={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Destino</span>
          <select className="form-input" name="targetWarehouseId" required={needsTarget} disabled={!needsTarget} defaultValue={warehouses[0]?.id || ""}>
            <option value="">Nao se aplica</option>
            {warehouses.map((warehouse) => (
              <option value={warehouse.id} key={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Documento</span>
        <input className="form-input mono" name="document" placeholder="NF, OP, inventario..." maxLength={80} />
      </label>

      <label className="field">
        <span>Justificativa</span>
        <input className="form-input" name="justification" placeholder="Motivo da movimentacao" maxLength={240} />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || items.length === 0 || warehouses.length === 0}>
        <ArrowDownUp size={17} />
        {loading ? "Registrando..." : "Registrar movimento"}
      </button>
    </form>
  );
}
