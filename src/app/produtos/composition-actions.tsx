"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";

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
  const isTestComposition = editData.code.startsWith("TEST-COMP-");
  const lockedForActions = locked && !isTestComposition;

  async function deleteComposition() {
    const confirmed = window.confirm("Excluir esta ficha tecnica? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    try {
      await fetchJson(`/api/produtos/composicoes/${compositionId}`, { method: "DELETE" }, "Nao foi possivel excluir a ficha tecnica.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a ficha tecnica.");
      setLoading("");
      return;
    } finally {
      setLoading("");
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell decision-actions">
      <div className="button-row compact-actions">
        <a
          className={`secondary-button mini-button${lockedForActions || loading ? " disabled-link" : ""}`}
          href={lockedForActions || loading ? undefined : `/produtos/composicoes/${compositionId}/editar`}
          aria-disabled={lockedForActions || Boolean(loading)}
          title={`Editar ${editData.code}`}
        >
          <Pencil size={15} />
          Editar
        </a>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteComposition} disabled={lockedForActions || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {lockedForActions ? <small className="metric-sub">Travada por ordem de producao.</small> : null}
      {locked && isTestComposition ? <small className="metric-sub">Teste: exclusao remove OP vinculada.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
