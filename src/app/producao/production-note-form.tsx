"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { productionNoteSchema } from "@/lib/validations/production";

type OrderOption = {
  id: string;
  number: string;
  product: string;
  stages: string[];
};

type ProductionNoteFormProps = {
  orders: OrderOption[];
};

export function ProductionNoteForm({ orders }: ProductionNoteFormProps) {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id || "");
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId]
  );
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/producao/apontamentos",
    schema: productionNoteSchema,
    fallbackError: "Nao foi possivel registrar o apontamento.",
    successMessage: "Apontamento registrado com sucesso.",
    buildPayload: (formData) => ({
      productionOrderId: selectedOrderId,
      stage: formData.get("stage"),
      producedQuantity: formData.get("producedQuantity") || 0,
      lossQuantity: formData.get("lossQuantity") || 0,
      scrapQuantity: formData.get("scrapQuantity") || 0,
      downtimeMinutes: formData.get("downtimeMinutes") || 0,
      note: formData.get("note") || undefined,
      finishStage: formData.get("finishStage") === "on"
    })
  });

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Ordem de producao</span>
        <select
          className="form-input"
          value={selectedOrderId}
          onChange={(event) => setSelectedOrderId(event.target.value)}
          required
        >
          {orders.map((order) => (
            <option value={order.id} key={order.id}>
              {order.number} - {order.product}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Etapa</span>
        <select className="form-input" name="stage" required>
          {(selectedOrder?.stages || []).map((stage) => (
            <option value={stage} key={stage}>
              {stage}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Produzido</span>
          <input className="form-input mono" name="producedQuantity" type="number" min="0" step="0.001" defaultValue="0" />
        </label>
        <label className="field">
          <span>Perda</span>
          <input className="form-input mono" name="lossQuantity" type="number" min="0" step="0.001" defaultValue="0" />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Sucata</span>
          <input className="form-input mono" name="scrapQuantity" type="number" min="0" step="0.001" defaultValue="0" />
        </label>
        <label className="field">
          <span>Parada min.</span>
          <input className="form-input mono" name="downtimeMinutes" type="number" min="0" step="1" defaultValue="0" />
        </label>
      </div>

      <label className="field">
        <span>Observacao</span>
        <input className="form-input" name="note" placeholder="Ex.: cura iniciada, forma liberada, retrabalho..." maxLength={500} />
      </label>

      <div className="check-row">
        <label>
          <input name="finishStage" type="checkbox" />
          Concluir etapa e avancar OP
        </label>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || orders.length === 0}>
        <ClipboardCheck size={17} />
        {loading ? "Registrando..." : "Registrar apontamento"}
      </button>
    </form>
  );
}
