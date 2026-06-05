"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { productionDailyLogSchema } from "@/lib/validations/production";

type ProductOption = {
  id: string;
  label: string;
  hasApprovedComposition: boolean;
  compositionCode: string | null;
};

type ProductionLine = {
  itemId: string;
  quantity: string;
  note: string;
};

type ProductionDailyLogFormProps = {
  products: ProductOption[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductionDailyLogForm({ products }: ProductionDailyLogFormProps) {
  const [lines, setLines] = useState<ProductionLine[]>([
    { itemId: products[0]?.id || "", quantity: "", note: "" }
  ]);
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/producao/diario",
    schema: productionDailyLogSchema,
    fallbackError: "Nao foi possivel registrar o diario.",
    successMessage: "Diario de producao registrado com sucesso.",
    buildPayload: (formData) => ({
      logDate: formData.get("logDate"),
      teamPresent: formData.get("teamPresent"),
      weatherMorning: formData.get("weatherMorning"),
      weatherAfternoon: formData.get("weatherAfternoon"),
      observation: formData.get("observation") || undefined,
      items: lines
        .filter((line) => line.itemId && Number(line.quantity) > 0)
        .map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          note: line.note || undefined
        }))
    }),
    onSuccess: () => setLines([{ itemId: products[0]?.id || "", quantity: "", note: "" }])
  });

  function updateLine(index: number, field: keyof ProductionLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line)
    );
  }

  function addLine() {
    setLines((current) => [...current, { itemId: products[0]?.id || "", quantity: "", note: "" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <form className="product-form daily-production-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Data</span>
        <input className="form-input mono" name="logDate" type="date" defaultValue={today()} required />
      </label>

      <label className="field">
        <span>Equipe que compareceu</span>
        <textarea
          className="form-input production-textarea"
          name="teamPresent"
          placeholder="Ex.: Joao, Carlos, Pedro"
          required
          maxLength={1000}
        />
      </label>

      <div className="form-two">
        <label className="field">
          <span>Clima de manha</span>
          <select className="form-input" name="weatherMorning" defaultValue="Sol">
            <option value="Sol">Sol</option>
            <option value="Chuva">Chuva</option>
            <option value="Nublado">Nublado</option>
            <option value="Misto">Misto</option>
          </select>
        </label>
        <label className="field">
          <span>Clima de tarde</span>
          <select className="form-input" name="weatherAfternoon" defaultValue="Sol">
            <option value="Sol">Sol</option>
            <option value="Chuva">Chuva</option>
            <option value="Nublado">Nublado</option>
            <option value="Misto">Misto</option>
          </select>
        </label>
      </div>

      <div className="daily-lines">
        <div className="daily-section-title">
          <div>
            <span className="mono">Producao diaria</span>
            <p className="metric-sub">
              Pecas com ficha aprovada baixam automaticamente os insumos do estoque de materia-prima.
            </p>
          </div>
          <button className="secondary-button mini-button" type="button" onClick={addLine} disabled={products.length === 0}>
            <Plus size={14} />
            Item
          </button>
        </div>

        {lines.map((line, index) => (
          <div className="daily-line" key={`${index}-${line.itemId}`}>
            <label className="field">
              <span>Item produzido</span>
              <select
                className="form-input"
                value={line.itemId}
                onChange={(event) => updateLine(index, "itemId", event.target.value)}
                required
              >
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                  {product.label}
                </option>
              ))}
            </select>
              {products.find((product) => product.id === line.itemId)?.hasApprovedComposition ? (
                <small className="field-hint">
                  Ficha vinculada: {products.find((product) => product.id === line.itemId)?.compositionCode}
                </small>
              ) : (
                <small className="field-hint warning">
                  Sem ficha aprovada: gera lote, mas nao baixa insumos automaticamente.
                </small>
              )}
            </label>

            <label className="field">
              <span>Quantidade</span>
              <input
                className="form-input mono"
                type="number"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(event) => updateLine(index, "quantity", event.target.value)}
                required
              />
            </label>

            <label className="field daily-note-field">
              <span>Obs. do item</span>
              <input
                className="form-input"
                value={line.note}
                onChange={(event) => updateLine(index, "note", event.target.value)}
                placeholder="Opcional"
                maxLength={300}
              />
            </label>

            <button
              className="icon-button daily-remove"
              type="button"
              onClick={() => removeLine(index)}
              disabled={lines.length === 1}
              aria-label="Remover item"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <label className="field">
        <span>Observacoes do dia</span>
        <textarea
          className="form-input production-textarea"
          name="observation"
          placeholder="Ex.: faltou areia no fim da tarde, chuva atrasou a cura, equipe reduzida..."
          maxLength={1000}
        />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || products.length === 0}>
        <Save size={17} />
        {loading ? "Salvando..." : "Salvar diario"}
      </button>
    </form>
  );
}
