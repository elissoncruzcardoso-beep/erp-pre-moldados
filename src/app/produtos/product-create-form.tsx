"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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

type ProductCreateFormProps = {
  units: UnitOption[];
  inputGroups?: InputGroupOption[];
};

export function ProductCreateForm({ units, inputGroups = [] }: ProductCreateFormProps) {
  const [type, setType] = useState("PECA_PRE_MOLDADA");
  const usesCuring = type === "PECA_PRE_MOLDADA" || type === "PRODUTO_ACABADO";
  const groupOptions = inputGroups.filter((group) => {
    if (type === "MATERIA_PRIMA" || type === "INSUMO" || type === "FORMA_MOLDE" || type === "SERVICO") {
      return group.type === type;
    }

    return true;
  });
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/produtos",
    schema: productSchema,
    fallbackError: "Nao foi possivel cadastrar o produto.",
    successMessage: "Produto cadastrado com sucesso.",
    buildPayload: (formData) => {
      const selectedType = String(formData.get("type") || "");
      const selectedTypeUsesCuring = selectedType === "PECA_PRE_MOLDADA" || selectedType === "PRODUTO_ACABADO";

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
        active: true
      };
    }
  });

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <div className="product-form-group">
        <div className="form-group-title">
          <strong>Dados principais</strong>
          <span>Identificacao tecnica do item.</span>
        </div>

        <label className="field">
          <span>Codigo</span>
          <input className="form-input mono" name="code" placeholder="Automatico se vazio" maxLength={40} />
        </label>

        <label className="field">
          <span>Descricao</span>
          <input className="form-input" name="description" placeholder="Viga pre-moldada 6m" required maxLength={180} />
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
            <select className="form-input" name="unitId" required defaultValue={units[0]?.id || ""}>
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
          <select className="form-input" name="group" defaultValue="">
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
      </div>

      <div className="product-form-group">
        <div className="form-group-title">
          <strong>Controle de estoque</strong>
          <span>Parametros para saldo, custo e rastreio.</span>
        </div>

        <div className="form-two">
          <label className="field">
            <span>Estoque minimo</span>
            <input className="form-input mono" name="minimumStock" type="number" min="0" step="0.001" defaultValue="0" />
          </label>
          <label className="field">
            <span>Custo padrao</span>
            <input className="form-input mono" name="standardCost" type="number" min="0" step="0.0001" defaultValue="0" />
          </label>
        </div>

        {usesCuring ? (
          <label className="field">
            <span>Tempo de cura automatico (horas)</span>
            <input className="form-input mono" name="curingHours" type="number" min="0" max="720" step="1" defaultValue="24" />
            <small className="field-hint">Usado apenas para peca pre-moldada ou produto acabado.</small>
          </label>
        ) : (
          <div className="field-readonly-note">
            Tempo de cura nao se aplica a materia-prima, insumo, forma/molde ou servico.
          </div>
        )}

        <div className="check-row">
          <label>
            <input name="controlsStock" type="checkbox" defaultChecked />
            Controla estoque
          </label>
          <label>
            <input name="controlsLot" type="checkbox" />
            Controla lote
          </label>
        </div>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || units.length === 0}>
        <Plus size={17} />
        {loading ? "Salvando..." : "Cadastrar produto"}
      </button>
    </form>
  );
}
