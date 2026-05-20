"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, X } from "lucide-react";

type Props = {
  quoteId: string;
  status: string;
  hasOrder: boolean;
};

export function PurchaseQuoteActions({ quoteId, status, hasOrder }: Props) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");

  async function runAction(action: "aprovar" | "reprovar" | "converter-pedido") {
    setError("");
    setLoadingAction(action);

    const response = await fetch(`/api/suprimentos/cotacoes/${quoteId}/${action}`, {
      method: action === "converter-pedido" ? "POST" : "PATCH"
    });
    const data = await response.json().catch(() => null);
    setLoadingAction("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel concluir a acao.");
      return;
    }

    router.refresh();
  }

  const canApprove = status === "RECEBIDA" || status === "REPROVADA";
  const canReject = status === "RECEBIDA" || status === "APROVADA";
  const canConvert = status === "APROVADA" && !hasOrder;

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button
          className="secondary-button mini-button"
          type="button"
          disabled={!canApprove || Boolean(loadingAction)}
          onClick={() => runAction("aprovar")}
          title="Aprovar cotacao"
        >
          <Check size={15} />
          Aprovar
        </button>
        <button
          className="secondary-button mini-button danger-text"
          type="button"
          disabled={!canReject || hasOrder || Boolean(loadingAction)}
          onClick={() => runAction("reprovar")}
          title="Reprovar cotacao"
        >
          <X size={15} />
          Reprovar
        </button>
        <button
          className="primary-button mini-button"
          type="button"
          disabled={!canConvert || Boolean(loadingAction)}
          onClick={() => runAction("converter-pedido")}
          title="Converter em pedido de compra"
        >
          <FilePlus2 size={15} />
          Pedido
        </button>
      </div>
      {loadingAction ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
