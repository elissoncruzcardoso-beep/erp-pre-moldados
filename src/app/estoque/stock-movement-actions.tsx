"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
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

type MovementActionData = {
  id: string;
  type: string;
  itemId: string;
  quantity: string;
  unitCost: string;
  originWarehouseId: string;
  targetWarehouseId: string;
  document: string;
  justification: string;
  locked: boolean;
};

type StockMovementActionsProps = {
  movement: MovementActionData;
  items: StockItem[];
  warehouses: WarehouseOption[];
  canManageMovements: boolean;
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

function requiresOrigin(type: string) {
  return ["SAIDA_PRODUCAO", "AJUSTE_NEGATIVO", "RESERVA", "TRANSFERENCIA"].includes(type);
}

function requiresTarget(type: string) {
  return ["ENTRADA_COMPRA", "ENTRADA_PRODUCAO", "AJUSTE_POSITIVO", "TRANSFERENCIA"].includes(type);
}

export function StockMovementActions({ movement, items, warehouses, canManageMovements }: StockMovementActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(movement.type);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const needsOrigin = requiresOrigin(type);
  const needsTarget = requiresTarget(type);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

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
      setLoading(false);
      return;
    }

    try {
      await fetchJson(`/api/estoque/movimentacoes/${movement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, "Nao foi possivel editar a movimentacao.");
      setEditing(false);
      router.refresh();
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel editar a movimentacao.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Excluir esta movimentacao e desfazer o saldo gerado por ela?")) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      await fetchJson(`/api/estoque/movimentacoes/${movement.id}`, {
        method: "DELETE"
      }, "Nao foi possivel excluir a movimentacao.");
      router.refresh();
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a movimentacao.");
    } finally {
      setLoading(false);
    }
  }

  if (!canManageMovements) {
    return <small className="metric-sub">Sem permissão para corrigir.</small>;
  }

  if (movement.locked) {
    return <small className="metric-sub">Travada por venda, NF ou producao.</small>;
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing(true)} disabled={loading}>
          <Pencil size={14} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-link" type="button" onClick={handleDelete} disabled={loading}>
          <Trash2 size={14} />
          Excluir
        </button>
      </div>
      {error ? <small className="auth-error">{error}</small> : null}

      {editing ? (
        <div className="modal-backdrop">
          <section className="controlled-cancel-modal stock-movement-edit-modal">
            <header>
              <div>
                <p className="eyebrow">Editar movimento</p>
                <h2>Corrigir registro de estoque</h2>
                <span>O saldo antigo sera desfeito e o novo saldo sera aplicado automaticamente.</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(false)}>
                <X size={18} />
              </button>
            </header>
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
                <select className="form-input" name="itemId" required defaultValue={movement.itemId}>
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
                  <input className="form-input mono" name="quantity" type="number" min="0.001" step="0.001" required defaultValue={movement.quantity} />
                </label>
                <label className="field">
                  <span>Custo unitario</span>
                  <input className="form-input mono" name="unitCost" type="number" min="0" step="0.0001" defaultValue={movement.unitCost} />
                </label>
              </div>
              <div className="form-two">
                <label className="field">
                  <span>Origem</span>
                  <select className="form-input" name="originWarehouseId" required={needsOrigin} disabled={!needsOrigin} defaultValue={movement.originWarehouseId}>
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
                  <select className="form-input" name="targetWarehouseId" required={needsTarget} disabled={!needsTarget} defaultValue={movement.targetWarehouseId}>
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
                <input className="form-input mono" name="document" maxLength={80} defaultValue={movement.document} />
              </label>
              <label className="field">
                <span>Justificativa</span>
                <input className="form-input" name="justification" maxLength={240} defaultValue={movement.justification} />
              </label>
              {error ? <p className="auth-error">{error}</p> : null}
              <footer>
                <button className="secondary-button" type="button" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar correcao"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
