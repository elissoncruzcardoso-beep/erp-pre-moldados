"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, Pencil, Trash2, X } from "lucide-react";

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type QuoteEditItem = {
  purchaseRequestItemId: string;
  itemId: string;
  label: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountValue: number;
  freightCost: number;
  note: string;
};

type QuoteEditData = {
  number: string;
  purchaseRequestId: string;
  supplierId: string;
  deliveryDays: number | null;
  paymentTerms: string;
  validUntil: string;
  freightCost: number;
  note: string;
  items: QuoteEditItem[];
};

type Props = {
  quoteId: string;
  status: string;
  hasOrder: boolean;
  suppliers?: SupplierOption[];
  editData?: QuoteEditData;
  variant?: "default" | "decision";
};

export function PurchaseQuoteActions({ quoteId, status, hasOrder, suppliers = [], editData, variant = "default" }: Props) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  async function runAction(action: "aprovar" | "reprovar" | "converter-pedido") {
    setError("");
    setLoadingAction(action);

    const response = await fetch(`/api/suprimentos/cotacoes/${quoteId}/${action}`, {
      method: action === "converter-pedido" ? "POST" : "PATCH"
    });
    const data = await response.json().catch(() => null);
    setLoadingAction("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel concluir a acao.");
      return;
    }

    router.refresh();
  }

  async function updateQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editData) return;

    setError("");
    setLoadingAction("editar");

    const formData = new FormData(event.currentTarget);
    const supplierId = String(formData.get("supplierId") || "");
    const payload = {
      number: formData.get("number"),
      purchaseRequestId: editData.purchaseRequestId,
      supplierId,
      deliveryDays: formData.get("deliveryDays") || undefined,
      paymentTerms: formData.get("paymentTerms") || undefined,
      validUntil: formData.get("validUntil") || undefined,
      freightCost: formData.get("freightCost") || 0,
      note: formData.get("note") || undefined,
      items: editData.items.map((item) => ({
        purchaseRequestItemId: item.purchaseRequestItemId,
        itemId: item.itemId,
        supplierId,
        quantity: item.quantity,
        unitPrice: formData.get(`unitPrice-${item.purchaseRequestItemId}`) || 0,
        discountValue: formData.get(`discountValue-${item.purchaseRequestItemId}`) || 0,
        freightCost: formData.get(`lineFreightCost-${item.purchaseRequestItemId}`) || 0,
        note: formData.get(`itemNote-${item.purchaseRequestItemId}`) || undefined
      }))
    };

    const response = await fetch(`/api/suprimentos/cotacoes/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    setLoadingAction("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel editar a cotacao.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function deleteQuote() {
    const confirmed = window.confirm("Excluir esta cotacao? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoadingAction("excluir");

    const response = await fetch(`/api/suprimentos/cotacoes/${quoteId}`, {
      method: "DELETE"
    });
    const data = await response.json().catch(() => null);
    setLoadingAction("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel excluir a cotacao.");
      return;
    }

    router.refresh();
  }

  const canApprove = status === "RECEBIDA" || status === "REPROVADA";
  const canReject = status === "RECEBIDA" || status === "APROVADA";
  const canConvert = status === "APROVADA" && !hasOrder;
  const canEdit = Boolean(editData) && !hasOrder;
  const canDelete = !hasOrder;

  return (
    <div className={`quote-action-cell ${variant === "decision" ? "decision-actions" : ""}`}>
      <div className="button-row compact-actions">
        <button
          className="secondary-button mini-button"
          type="button"
          disabled={!canEdit || Boolean(loadingAction)}
          onClick={() => setEditing((current) => !current)}
          title="Editar cotacao"
        >
          <Pencil size={15} />
          Editar
        </button>
        <button
          className="secondary-button mini-button"
          type="button"
          disabled={!canApprove || Boolean(loadingAction)}
          onClick={() => runAction("aprovar")}
          title="Aprovar cotacao"
        >
          <Check size={15} />
          Aprovar
        </button>
        <button
          className="secondary-button mini-button danger-text"
          type="button"
          disabled={!canReject || hasOrder || Boolean(loadingAction)}
          onClick={() => runAction("reprovar")}
          title="Reprovar cotacao"
        >
          <X size={15} />
          Reprovar
        </button>
        <button
          className="primary-button mini-button"
          type="button"
          disabled={!canConvert || Boolean(loadingAction)}
          onClick={() => runAction("converter-pedido")}
          title="Converter em pedido de compra"
        >
          <FilePlus2 size={15} />
          Pedido
        </button>
        <button
          className="secondary-button mini-button danger-text"
          type="button"
          disabled={!canDelete || Boolean(loadingAction)}
          onClick={deleteQuote}
          title="Excluir cotacao"
        >
          <Trash2 size={15} />
          Excluir
        </button>
      </div>
      {editing && editData ? (
        <form className="quote-edit-form" onSubmit={updateQuote}>
          <div className="form-two">
            <label className="field">
              <span>Numero</span>
              <input className="form-input mono" name="number" defaultValue={editData.number} required />
            </label>
            <label className="field">
              <span>Fornecedor</span>
              <select className="form-input" name="supplierId" defaultValue={editData.supplierId} required>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="quote-item-lines">
            {editData.items.map((item) => (
              <div className="quote-edit-line" key={item.purchaseRequestItemId}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.quantity.toLocaleString("pt-BR")} {item.unitCode}</small>
                </div>
                <label className="field">
                  <span>Preco unit.</span>
                  <input className="form-input mono" name={`unitPrice-${item.purchaseRequestItemId}`} type="number" min="0" step="0.01" defaultValue={item.unitPrice} required />
                </label>
                <label className="field">
                  <span>Desconto</span>
                  <input className="form-input mono" name={`discountValue-${item.purchaseRequestItemId}`} type="number" min="0" step="0.01" defaultValue={item.discountValue} />
                </label>
                <label className="field">
                  <span>Frete item</span>
                  <input className="form-input mono" name={`lineFreightCost-${item.purchaseRequestItemId}`} type="number" min="0" step="0.01" defaultValue={item.freightCost} />
                </label>
                <label className="field">
                  <span>Obs.</span>
                  <input className="form-input" name={`itemNote-${item.purchaseRequestItemId}`} defaultValue={item.note} />
                </label>
              </div>
            ))}
          </div>

          <div className="form-two">
            <label className="field">
              <span>Frete geral</span>
              <input className="form-input mono" name="freightCost" type="number" min="0" step="0.01" defaultValue={editData.freightCost} />
            </label>
            <label className="field">
              <span>Prazo dias</span>
              <input className="form-input mono" name="deliveryDays" type="number" min="0" step="1" defaultValue={editData.deliveryDays ?? ""} />
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Validade</span>
              <input className="form-input" name="validUntil" type="date" defaultValue={editData.validUntil} />
            </label>
            <label className="field">
              <span>Pagamento</span>
              <input className="form-input" name="paymentTerms" defaultValue={editData.paymentTerms} />
            </label>
          </div>

          <label className="field">
            <span>Observacao</span>
            <textarea className="form-input" name="note" rows={2} defaultValue={editData.note} />
          </label>

          <div className="button-row">
            <button className="primary-button mini-button" type="submit" disabled={Boolean(loadingAction)}>
              Salvar
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setEditing(false)} disabled={Boolean(loadingAction)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      {loadingAction ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
