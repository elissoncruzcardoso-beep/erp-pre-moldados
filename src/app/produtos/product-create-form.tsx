"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type UnitOption = {
  id: string;
  code: string;
  name: string;
};

type ProductCreateFormProps = {
  units: UnitOption[];
};

export function ProductCreateForm({ units }: ProductCreateFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: formData.get("code"),
        description: formData.get("description"),
        type: formData.get("type"),
        group: formData.get("group") || undefined,
        unitId: formData.get("unitId"),
        controlsStock: formData.get("controlsStock") === "on",
        controlsLot: formData.get("controlsLot") === "on",
        minimumStock: formData.get("minimumStock") || 0,
        standardCost: formData.get("standardCost") || 0,
        active: true
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel cadastrar o produto.");
      return;
    }

    event.currentTarget.reset();
    setMessage("Produto cadastrado com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Codigo</span>
        <input className="form-input mono" name="code" placeholder="PA-120" required maxLength={40} />
      </label>

      <label className="field">
        <span>Descricao</span>
        <input className="form-input" name="description" placeholder="Viga pre-moldada 6m" required maxLength={180} />
      </label>

      <div className="form-two">
        <label className="field">
          <span>Tipo</span>
          <select className="form-input" name="type" defaultValue="PECA_PRE_MOLDADA">
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
        <input className="form-input" name="group" placeholder="Estrutural, concreto, armadura..." maxLength={80} />
      </label>

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

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || units.length === 0}>
        <Plus size={17} />
        {loading ? "Salvando..." : "Cadastrar produto"}
      </button>
    </form>
  );
}
