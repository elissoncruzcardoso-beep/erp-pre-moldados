"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, X } from "lucide-react";

type OrderItemEdit = {
  id: string;
  label: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  note: string;
};

type EditData = {
  number: string;
  status: string;
  expectedDeliveryAt: string;
  paymentTerms: string;
  freightCost: number;
  note: string;
  items: OrderItemEdit[];
};

type Props = {
  orderId: string;
  locked: boolean;
  editData: EditData;
};

export function PurchaseOrderActions({ orderId, locked, editData }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading("editar");

    const response = await fetch(`/api/suprimentos/pedidos/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: formData.get("number"),
        status: formData.get("status"),
        expectedDeliveryAt: formData.get("expectedDeliveryAt") || undefined,
        paymentTerms: formData.get("paymentTerms") || undefined,
        freightCost: formData.get("freightCost") || 0,
        note: formData.get("note") || undefined,
        items: editData.items.map((item) => ({
          id: item.id,
          quantity: formData.get(`quantity-${item.id}`),
          unitPrice: formData.get(`unitPrice-${item.id}`),
          note: formData.get(`note-${item.id}`) || undefined
        }))
      })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel editar o pedido.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function deleteOrder() {
    const confirmed = window.confirm("Excluir este pedido? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");
    const response = await fetch(`/api/suprimentos/pedidos/${orderId}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel excluir o pedido.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={locked || Boolean(loading)}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteOrder} disabled={locked || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {editing ? (
        <form className="quote-edit-form" onSubmit={updateOrder}>
          <div className="form-two">
            <label className="field">
              <span>Numero</span>
              <input className="form-input mono" name="number" defaultValue={editData.number} required />
            </label>
            <label className="field">
              <span>Status</span>
              <select className="form-input" name="status" defaultValue={editData.status}>
                <option value="EMITIDO">Emitido</option>
                <option value="ENVIADO">Enviado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </label>
          </div>

          {editData.items.map((item) => (
            <div className="quote-edit-line" key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <small>{item.unitCode}</small>
              </div>
              <label className="field">
                <span>Quantidade</span>
                <input className="form-input mono" name={`quantity-${item.id}`} type="number" min="0.001" step="0.001" defaultValue={item.quantity} required />
              </label>
              <label className="field">
                <span>Preco unit.</span>
                <input className="form-input mono" name={`unitPrice-${item.id}`} type="number" min="0" step="0.01" defaultValue={item.unitPrice} required />
              </label>
              <label className="field">
                <span>Obs.</span>
                <input className="form-input" name={`note-${item.id}`} defaultValue={item.note} />
              </label>
            </div>
          ))}

          <div className="form-two">
            <label className="field">
              <span>Frete</span>
              <input className="form-input mono" name="freightCost" type="number" min="0" step="0.01" defaultValue={editData.freightCost} />
            </label>
            <label className="field">
              <span>Entrega prevista</span>
              <input className="form-input" name="expectedDeliveryAt" type="date" defaultValue={editData.expectedDeliveryAt} />
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Pagamento</span>
              <input className="form-input" name="paymentTerms" defaultValue={editData.paymentTerms} />
            </label>
            <label className="field">
              <span>Observacao</span>
              <input className="form-input" name="note" defaultValue={editData.note} />
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button mini-button" type="submit" disabled={Boolean(loading)}>
              <Save size={15} />
              Salvar
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setEditing(false)} disabled={Boolean(loading)}>
              <X size={15} />
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {locked ? <small className="metric-sub">Travado por nota fiscal.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
