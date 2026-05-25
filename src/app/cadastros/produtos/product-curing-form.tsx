"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type ProductCuringFormProps = {
  itemId: string;
  curingHours: number;
};

export function ProductCuringForm({ itemId, curingHours }: ProductCuringFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading(true);

    const response = await fetch(`/api/produtos/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        curingHours: formData.get("curingHours") || 0
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel atualizar.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="inline-curing-form" onSubmit={handleSubmit}>
      <input
        className="form-input mono"
        name="curingHours"
        type="number"
        min="0"
        max="720"
        step="1"
        defaultValue={curingHours}
        aria-label="Tempo de cura em horas"
      />
      <button className="icon-button small-icon-button" type="submit" disabled={loading} title="Salvar cura">
        <Save size={14} />
      </button>
      {error ? <small className="inline-error">{error}</small> : null}
    </form>
  );
}
