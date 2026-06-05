"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { formatValidationError } from "@/lib/validations/client";
import { purchaseReceiptUpdateSchema } from "@/lib/validations/purchase";

type EditData = {
  number: string;
  invoiceNumber: string;
  supplierLot: string;
  receivedAt: string;
  note: string;
};

type Props = {
  receiptId: string;
  locked: boolean;
  editData: EditData;
};

export function PurchaseReceiptActions({ receiptId, locked, editData }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function updateReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading("editar");

    const payload = {
      number: formData.get("number"),
      invoiceNumber: formData.get("invoiceNumber") || undefined,
      supplierLot: formData.get("supplierLot") || undefined,
      receivedAt: formData.get("receivedAt") || undefined,
      note: formData.get("note") || undefined
    };
    const parsed = purchaseReceiptUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      setLoading("");
      return;
    }

    try {
      await fetchJson(`/api/suprimentos/recebimentos/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, "Nao foi possivel editar a nota fiscal.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel editar a nota fiscal.");
      setLoading("");
      return;
    }

    setLoading("");
    setEditing(false);
    router.refresh();
  }

  async function deleteReceipt() {
    const confirmed = window.confirm("Excluir esta nota fiscal? O sistema vai estornar a entrada no estoque.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    try {
      await fetchJson(`/api/suprimentos/recebimentos/${receiptId}`, { method: "DELETE" }, "Nao foi possivel excluir a nota fiscal.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a nota fiscal.");
      setLoading("");
      return;
    }

    setLoading("");
    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={locked || Boolean(loading)}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteReceipt} disabled={locked || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {editing ? (
        <form className="quote-edit-form" onSubmit={updateReceipt}>
          <div className="form-two">
            <label className="field">
              <span>Codigo interno</span>
              <input className="form-input mono" name="number" defaultValue={editData.number} required />
            </label>
            <label className="field">
              <span>Numero NF</span>
              <input className="form-input mono" name="invoiceNumber" defaultValue={editData.invoiceNumber} />
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Lote fornecedor</span>
              <input className="form-input" name="supplierLot" defaultValue={editData.supplierLot} />
            </label>
            <label className="field">
              <span>Recebido em</span>
              <input className="form-input" name="receivedAt" type="date" defaultValue={editData.receivedAt} />
            </label>
          </div>

          <label className="field">
            <span>Observacao</span>
            <textarea className="form-input" name="note" rows={2} defaultValue={editData.note} />
          </label>

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

      {locked ? <small className="metric-sub">Travada por financeiro.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
