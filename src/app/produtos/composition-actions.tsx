"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import {
  CompositionForm,
  type CompositionInitialData,
  type CompositionMaterialOption,
  type CompositionProductOption
} from "./composition-form";

type Props = {
  compositionId: string;
  locked: boolean;
  editData: CompositionInitialData;
  products: CompositionProductOption[];
  materials: CompositionMaterialOption[];
};

export function CompositionActions({ compositionId, locked, editData, products, materials }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
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
        <button
          className="secondary-button mini-button"
          type="button"
          onClick={() => setEditing(true)}
          disabled={lockedForActions || Boolean(loading)}
          title={`Editar ${editData.code}`}
        >
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteComposition} disabled={lockedForActions || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {lockedForActions ? <small className="metric-sub">Travada por ordem de producao.</small> : null}
      {locked && isTestComposition ? <small className="metric-sub">Teste: exclusao remove OP vinculada.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}

      {editing ? (
        <div className="composition-edit-overlay" role="dialog" aria-modal="true" aria-labelledby={`composition-edit-${compositionId}`}>
          <section className="composition-edit-form composition-edit-modal">
            <header className="composition-edit-header">
              <div>
                <p className="eyebrow">Editar composicao</p>
                <h2 id={`composition-edit-${compositionId}`} className="mono">{editData.code}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(false)} aria-label="Fechar edicao">
                <X size={18} />
              </button>
            </header>
            <div className="composition-edit-body">
              <CompositionForm
                mode="edit"
                compositionId={compositionId}
                products={products}
                materials={materials}
                initialData={editData}
                onCancel={() => setEditing(false)}
                onDone={() => {
                  setEditing(false);
                  router.refresh();
                }}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
