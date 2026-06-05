"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Power, Save, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { productSchema } from "@/lib/validations/product";

type UnitOption = {
  id: string;
  code: string;
  name: string;
};

type InputGroupOption = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type ProductCatalogActionsProps = {
  item: {
    id: string;
    code: string;
    description: string;
    type: string;
    group: string;
    unitId: string;
    controlsStock: boolean;
    controlsLot: boolean;
    minimumStock: number;
    standardCost: number;
    curingHours: number;
    active: boolean;
  };
  units: UnitOption[];
  inputGroups?: InputGroupOption[];
};

function typeUsesCuring(type: string) {
  return type === "PECA_PRE_MOLDADA" || type === "PRODUTO_ACABADO";
}

export function ProductCatalogActions({ item, units, inputGroups = [] }: ProductCatalogActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [type, setType] = useState(item.type);
  const usesCuring = typeUsesCuring(type);
  const baseGroupOptions = inputGroups.filter((group) => {
    if (type === "MATERIA_PRIMA" || type === "INSUMO" || type === "FORMA_MOLDE" || type === "SERVICO") {
      return group.type === type;
    }

    return true;
  });
  const hasCurrentGroup = !item.group || baseGroupOptions.some((group) => group.name === item.group);
  const groupOptions = hasCurrentGroup
    ? baseGroupOptions
    : [{ id: "current-group", code: "Atual", name: item.group, type: item.type }, ...baseGroupOptions];
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: `/api/produtos/${item.id}`,
    method: "PATCH",
    schema: productSchema,
    fallbackError: "Nao foi possivel atualizar o produto.",
    successMessage: "Produto atualizado.",
    resetOnSuccess: false,
    buildPayload: (formData) => {
      const selectedType = String(formData.get("type") || "");
      const selectedTypeUsesCuring = typeUsesCuring(selectedType);

      return {
        code: formData.get("code"),
        description: formData.get("description"),
        type: formData.get("type"),
        group: formData.get("group") || undefined,
        unitId: formData.get("unitId"),
        controlsStock: formData.get("controlsStock") === "on",
        controlsLot: formData.get("controlsLot") === "on",
        minimumStock: formData.get("minimumStock") || 0,
        standardCost: formData.get("standardCost") || 0,
        curingHours: selectedTypeUsesCuring ? formData.get("curingHours") || 24 : 0,
        active: formData.get("active") === "true"
      };
    },
    onSuccess: () => setEditing(false)
  });

  async function toggleOrDeleteProduct() {
    setDeleteError("");
    const actionLabel = item.active ? "excluir ou inativar" : "reativar";
    const confirmed = window.confirm(`Deseja ${actionLabel} o produto ${item.code}?`);

    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/produtos/${item.id}`, { method: "DELETE" }, "Nao foi possivel alterar o produto.");
      router.refresh();
    } catch (requestError) {
      setDeleteError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel alterar o produto.");
    }
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={loading}>
          <Edit3 size={14} />
          Editar
        </button>
        <button className={`secondary-button mini-button${item.active ? " danger-text" : ""}`} type="button" onClick={toggleOrDeleteProduct} disabled={loading}>
          {item.active ? <Trash2 size={14} /> : <Power size={14} />}
          {item.active ? "Excluir/Inativar" : "Reativar"}
        </button>
      </div>

      {deleteError ? <small className="auth-error">{deleteError}</small> : null}

      {editing ? (
        <form className="inline-edit-form product-catalog-edit-form" onSubmit={handleSubmit}>
          <input type="hidden" name="active" value={String(item.active)} />
          <label className="field">
            <span>Codigo</span>
            <input className="form-input mono" name="code" defaultValue={item.code} maxLength={40} />
          </label>
          <label className="field">
            <span>Descricao</span>
            <input className="form-input" name="description" defaultValue={item.description} maxLength={180} required />
          </label>
          <div className="form-two">
            <label className="field">
              <span>Tipo</span>
              <select className="form-input" name="type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="PECA_PRE_MOLDADA">Peca pre-moldada</option>
                <option value="PRODUTO_ACABADO">Produto acabado</option>
                <option value="MATERIA_PRIMA">Materia-prima</option>
                <option value="INSUMO">Insumo</option>
                <option value="FORMA_MOLDE">Forma/molde</option>
                <option value="SERVICO">Servico</option>
              </select>
            </label>
            <label className="field">
              <span>Unidade</span>
              <select className="form-input" name="unitId" defaultValue={item.unitId} required>
                {units.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.code} - {unit.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Grupo</span>
            <select className="form-input" name="group" defaultValue={item.group}>
              <option value="">Sem grupo</option>
              {groupOptions.map((group) => (
                <option value={group.name} key={group.id}>
                  {group.code} - {group.name}
                </option>
              ))}
            </select>
            {groupOptions.length === 0 ? (
              <small className="field-hint">Cadastre grupos em Cadastros &gt; Grupos de insumos.</small>
            ) : null}
          </label>
          <div className="form-two">
            <label className="field">
              <span>Estoque minimo</span>
              <input className="form-input mono" name="minimumStock" type="number" min="0" step="0.001" defaultValue={item.minimumStock} />
            </label>
            <label className="field">
              <span>Custo padrao</span>
              <input className="form-input mono" name="standardCost" type="number" min="0" step="0.0001" defaultValue={item.standardCost} />
            </label>
          </div>
          {usesCuring ? (
            <label className="field">
              <span>Tempo de cura (horas)</span>
              <input className="form-input mono" name="curingHours" type="number" min="0" max="720" step="1" defaultValue={item.curingHours} />
            </label>
          ) : (
            <div className="field-readonly-note">Tempo de cura nao se aplica a este tipo.</div>
          )}
          <div className="check-row">
            <label>
              <input name="controlsStock" type="checkbox" defaultChecked={item.controlsStock} />
              Controla estoque
            </label>
            <label>
              <input name="controlsLot" type="checkbox" defaultChecked={item.controlsLot} />
              Controla lote
            </label>
          </div>
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
