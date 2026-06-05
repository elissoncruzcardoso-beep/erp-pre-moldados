"use client";

import { CheckCircle2 } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { productionBatchReleaseSchema } from "@/lib/validations/production";

type BatchReleaseFormProps = {
  batchId: string;
  maxQuantity: number;
};

export function BatchReleaseForm({ batchId, maxQuantity }: BatchReleaseFormProps) {
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: `/api/producao/lotes/${batchId}/liberar`,
    schema: productionBatchReleaseSchema,
    fallbackError: "Nao foi possivel liberar o lote.",
    successMessage: "Lote liberado para retirada.",
    buildPayload: (formData) => ({
      releasedQuantity: formData.get("releasedQuantity"),
      releaseResponsible: formData.get("releaseResponsible"),
      releaseNote: formData.get("releaseNote") || undefined
    })
  });

  return (
    <form className="batch-release-form" onSubmit={handleSubmit}>
      <input
        className="form-input mono"
        name="releasedQuantity"
        type="number"
        min="0.001"
        max={maxQuantity}
        step="0.001"
        defaultValue={maxQuantity}
        aria-label="Quantidade liberada"
        required
      />
      <input
        className="form-input"
        name="releaseResponsible"
        placeholder="Responsavel"
        aria-label="Responsavel pela liberacao"
        required
        maxLength={120}
      />
      <input
        className="form-input"
        name="releaseNote"
        placeholder="Observacao"
        aria-label="Observacao"
        maxLength={500}
      />
      <button className="primary-button mini-button" type="submit" disabled={loading || maxQuantity <= 0}>
        <CheckCircle2 size={14} />
        {loading ? "..." : "Liberar"}
      </button>
      {error ? <p className="action-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}
    </form>
  );
}
