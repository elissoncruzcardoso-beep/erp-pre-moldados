"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { unitOfMeasureSchema } from "@/lib/validations/cadastros";

type UnitActionsProps = {
  unit: {
    id: string;
    code: string;
    name: string;
    decimals: number;
    itemsCount: number;
  };
};

export function UnitActions({ unit }: UnitActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: `/api/cadastros/unidades/${unit.id}`,
    method: "PUT",
    schema: unitOfMeasureSchema,
    fallbackError: "Nao foi possivel atualizar a unidade.",
    successMessage: "Unidade atualizada.",
    resetOnSuccess: false,
    buildPayload: (formData) => ({
      code: formData.get("code"),
      name: formData.get("name"),
      decimals: formData.get("decimals")
    }),
    onSuccess: () => setEditing(false)
  });

  async function deleteUnit() {
    setDeleteError("");

    if (unit.itemsCount > 0) {
      setDeleteError("Unidade em uso por produtos. Nao pode ser excluida.");
      return;
    }

    const confirmed = window.confirm(`Excluir a unidade ${unit.code}?`);

    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/cadastros/unidades/${unit.id}`, { method: "DELETE" }, "Nao foi possivel excluir a unidade.");
      router.refresh();
    } catch (requestError) {
      setDeleteError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a unidade.");
    }
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={loading}>
          <Edit3 size={14} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteUnit} disabled={loading || unit.itemsCount > 0}>
          <Trash2 size={14} />
          Excluir
        </button>
      </div>

      {unit.itemsCount > 0 ? <small className="metric-sub">Exclusao travada: unidade em uso.</small> : null}
      {deleteError ? <small className="auth-error">{deleteError}</small> : null}

      {editing ? (
        <form className="inline-edit-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Codigo</span>
            <input className="form-input mono" name="code" defaultValue={unit.code} maxLength={30} required />
          </label>
          <label className="field">
            <span>Nome</span>
            <input className="form-input" name="name" defaultValue={unit.name} maxLength={80} required />
          </label>
          <label className="field">
            <span>Decimais</span>
            <input className="form-input mono" name="decimals" type="number" min="0" max="6" defaultValue={unit.decimals} required />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          {success ? <p className="auth-success">{success}</p> : null}
          <div className="button-row compact-actions">
            <button className="primary-button mini-button" type="submit" disabled={loading}>
              <Save size={14} />
              Salvar
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setEditing(false)} disabled={loading}>
              <X size={14} />
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
