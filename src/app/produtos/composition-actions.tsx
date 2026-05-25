"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

type EditData = {
  code: string;
};

type Props = {
  compositionId: string;
  locked: boolean;
  editData: EditData;
};

export function CompositionActions({ compositionId, locked, editData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function deleteComposition() {
    const confirmed = window.confirm("Excluir esta ficha tecnica? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    const response = await fetch(`/api/produtos/composicoes/${compositionId}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel excluir a ficha tecnica.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell decision-actions">
      <div className="button-row compact-actions">
        <a
          className={`secondary-button mini-button${locked || loading ? " disabled-link" : ""}`}
          href={locked || loading ? undefined : `/produtos/composicoes/${compositionId}/editar`}
          aria-disabled={locked || Boolean(loading)}
          title={`Editar ${editData.code}`}
        >
          <Pencil size={15} />
          Editar
        </a>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteComposition} disabled={locked || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {locked ? <small className="metric-sub">Travada por ordem de producao.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
