"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Power, Save, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { inputGroupSchema } from "@/lib/validations/cadastros";

type FinancialGroupOption = {
  id: string;
  code: string;
  name: string;
};

type InputGroupActionsProps = {
  group: {
    id: string;
    code: string;
    name: string;
    type: string;
    defaultFinancialGroupId: string;
    controlsStock: boolean;
    active: boolean;
    note: string;
  };
  financialGroups: FinancialGroupOption[];
};

export function InputGroupActions({ group, financialGroups }: InputGroupActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: `/api/cadastros/grupos-insumos/${group.id}`,
    method: "PUT",
    schema: inputGroupSchema,
    fallbackError: "Nao foi possivel atualizar o grupo de insumos.",
    successMessage: "Grupo de insumos atualizado.",
    resetOnSuccess: false,
    buildPayload: (formData) => ({
      code: formData.get("code"),
      name: formData.get("name"),
      type: formData.get("type"),
      defaultFinancialGroupId: formData.get("defaultFinancialGroupId") || undefined,
      controlsStock: formData.get("controlsStock") === "on",
      active: formData.get("active") === "true",
      note: formData.get("note") || undefined
    }),
    onSuccess: () => setEditing(false)
  });

  async function toggleActive() {
    setToggleError("");
    const confirmed = window.confirm(group.active ? "Inativar este grupo de insumos?" : "Reativar este grupo de insumos?");

    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/cadastros/grupos-insumos/${group.id}`, { method: "DELETE" }, "Nao foi possivel alterar o status.");
      router.refresh();
    } catch (requestError) {
      setToggleError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel alterar o status.");
    }
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={loading}>
          <Edit3 size={14} />
          Editar
        </button>
        <button className={`secondary-button mini-button${group.active ? " danger-text" : ""}`} type="button" onClick={toggleActive} disabled={loading}>
          <Power size={14} />
          {group.active ? "Inativar" : "Reativar"}
        </button>
      </div>

      {toggleError ? <small className="auth-error">{toggleError}</small> : null}

      {editing ? (
        <form className="inline-edit-form" onSubmit={handleSubmit}>
          <input type="hidden" name="active" value={String(group.active)} />
          <div className="form-two">
            <label className="field">
              <span>Codigo</span>
              <input className="form-input mono" name="code" defaultValue={group.code} maxLength={30} required />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="form-input" name="type" defaultValue={group.type}>
                <option value="MATERIA_PRIMA">Materia-prima</option>
                <option value="INSUMO">Insumo</option>
                <option value="FORMA_MOLDE">Forma/molde</option>
                <option value="SERVICO">Servico</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Nome</span>
            <input className="form-input" name="name" defaultValue={group.name} maxLength={90} required />
          </label>
          <label className="field">
            <span>Grupo financeiro padrao</span>
            <select className="form-input" name="defaultFinancialGroupId" defaultValue={group.defaultFinancialGroupId}>
              <option value="">Sem vinculo</option>
              {financialGroups.map((financialGroup) => (
                <option value={financialGroup.id} key={financialGroup.id}>
                  {financialGroup.code} - {financialGroup.name}
                </option>
              ))}
            </select>
          </label>
          <div className="check-row">
            <label>
              <input name="controlsStock" type="checkbox" defaultChecked={group.controlsStock} />
              Controla estoque
            </label>
          </div>
          <label className="field">
            <span>Observacao</span>
            <textarea className="form-input production-textarea" name="note" defaultValue={group.note} maxLength={300} />
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
