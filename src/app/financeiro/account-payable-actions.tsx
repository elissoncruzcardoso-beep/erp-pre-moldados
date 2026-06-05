"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { formatValidationError } from "@/lib/validations/client";
import { accountPayableUpdateSchema } from "@/lib/validations/purchase";

type EditData = {
  dueDate: string;
  costCenter: string;
  note: string;
};

type Props = {
  payableId: string;
  number: string;
  editData: EditData;
  linkedToReceipt: boolean;
  hasPayments: boolean;
  canForceDelete: boolean;
};

export function AccountPayableActions({ payableId, number, editData, linkedToReceipt, hasPayments, canForceDelete }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const lockedDelete = !canForceDelete && (linkedToReceipt || hasPayments);

  async function updatePayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading("editar");

    const payload = {
      dueDate: formData.get("dueDate"),
      costCenter: formData.get("costCenter") || undefined,
      note: formData.get("note") || undefined
    };
    const parsed = accountPayableUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      setLoading("");
      return;
    }

    try {
      await fetchJson(`/api/financeiro/contas-pagar/${payableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, "Nao foi possivel editar a conta a pagar.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel editar a conta a pagar.");
      setLoading("");
      return;
    }

    setLoading("");
    setEditing(false);
    router.refresh();
  }

  async function deletePayable() {
    const confirmed = window.confirm("Excluir esta conta a pagar? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    try {
      await fetchJson(`/api/financeiro/contas-pagar/${payableId}`, { method: "DELETE" }, "Nao foi possivel excluir a conta a pagar.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a conta a pagar.");
      setLoading("");
      return;
    }

    setLoading("");
    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={Boolean(loading)}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deletePayable} disabled={lockedDelete || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {editing ? (
        <form className="quote-edit-form" onSubmit={updatePayable}>
          <div className="receipt-helper">
            <strong className="mono">{number}</strong>
            <p>Valores e fornecedor ficam preservados; ajuste apenas vencimento, centro de custo e observacao.</p>
          </div>

          <label className="field">
            <span>Vencimento</span>
            <input className="form-input mono" name="dueDate" type="date" defaultValue={editData.dueDate} required />
          </label>

          <div className="form-two">
            <label className="field">
              <span>Centro de custo</span>
              <input className="form-input" name="costCenter" defaultValue={editData.costCenter} maxLength={80} />
            </label>
            <label className="field">
              <span>Observacao</span>
              <input className="form-input" name="note" defaultValue={editData.note} maxLength={500} />
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

      {lockedDelete ? <small className="metric-sub">Exclusao travada por NF ou baixa.</small> : null}
      {canForceDelete && (linkedToReceipt || hasPayments) ? <small className="metric-sub">Exclusao liberada pelo perfil.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
