"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

type BatchReleaseFormProps = {
  batchId: string;
  maxQuantity: number;
};

export function BatchReleaseForm({ batchId, maxQuantity }: BatchReleaseFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(form);
    const response = await fetch(`/api/producao/lotes/${batchId}/liberar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releasedQuantity: formData.get("releasedQuantity"),
        releaseResponsible: formData.get("releaseResponsible"),
        releaseNote: formData.get("releaseNote") || undefined
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel liberar o lote.");
      return;
    }

    form.reset();
    setMessage("Lote liberado para retirada.");
    router.refresh();
  }

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
      {message ? <p className="auth-success">{message}</p> : null}
    </form>
  );
}
