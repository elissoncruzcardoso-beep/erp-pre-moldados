"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Edit3, Printer, RotateCcw, X, XCircle } from "lucide-react";

type DirectSaleActionsProps = {
  sale: {
    id: string;
    number?: string;
    customerName: string;
    customerDocument: string;
    unitPrice: string;
    discount: string;
    finalTotal?: string;
    paymentMethod: string;
    note: string;
    status: string;
    itemCount?: number;
    receivableNumber?: string;
    receivableStatus?: string;
    receiptCount?: number;
  };
};

export function DirectSaleActions({ sale }: DirectSaleActionsProps) {
  const router = useRouter();
  const disabled = sale.status !== "ATIVA";
  const editDisabled = disabled || Number(sale.itemCount || 1) > 1;
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);

  async function editSale() {
    if (editDisabled) {
      return;
    }

    const customerName = window.prompt("Cliente", sale.customerName);

    if (!customerName) {
      return;
    }

    const customerDocument = window.prompt("CPF/CNPJ", sale.customerDocument) ?? sale.customerDocument;
    const unitPrice = window.prompt("Preco unitario", sale.unitPrice) ?? sale.unitPrice;
    const discount = window.prompt("Desconto", sale.discount) ?? sale.discount;
    const paymentMethod = window.prompt("Forma de pagamento", sale.paymentMethod) ?? sale.paymentMethod;
    const note = window.prompt("Observacao", sale.note) ?? sale.note;

    const response = await fetch(`/api/estoque/vendas/${sale.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        customerDocument,
        unitPrice,
        discount,
        paymentMethod,
        note
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel editar o recibo.");
      return;
    }

    router.refresh();
  }

  async function cancelSale() {
    if (disabled) {
      return;
    }

    const reason = cancelReason.trim();
    if (reason.length < 3) {
      window.alert("Informe o motivo do cancelamento.");
      return;
    }

    setCanceling(true);
    const response = await fetch(`/api/estoque/vendas/${sale.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const data = await response.json().catch(() => ({}));
    setCanceling(false);

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel cancelar o recibo.");
      return;
    }

    setShowCancelPanel(false);
    setCancelReason("");
    router.refresh();
  }

  return (
    <>
      <div className="quote-action-cell">
        <Link className="icon-button" href={`/vendas/recibos/${sale.id}`} title="Reimprimir recibo">
          <Printer size={16} />
        </Link>
        <button
          className="icon-button"
          type="button"
          onClick={editSale}
          disabled={editDisabled}
          title={editDisabled && !disabled ? "Recibo multi-itens: cancele e lance novamente para alterar valores" : "Editar dados comerciais"}
        >
          <Edit3 size={16} />
        </button>
        <button className="icon-button danger" type="button" onClick={() => setShowCancelPanel(true)} disabled={disabled} title="Cancelar com estorno controlado">
          <XCircle size={16} />
        </button>
      </div>

      {showCancelPanel ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="controlled-cancel-modal">
            <header>
              <div>
                <p className="eyebrow">Cancelamento controlado</p>
                <h2>{sale.number || "Recibo de venda"}</h2>
                <span>{sale.customerName}</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowCancelPanel(false)} disabled={canceling}>
                <X size={17} />
              </button>
            </header>

            <div className="cancel-impact-grid">
              <article>
                <CheckCircle2 size={18} />
                <strong>Estoque</strong>
                <span>As pecas vendidas voltam para o deposito de origem por movimento de estorno.</span>
              </article>
              <article>
                <CheckCircle2 size={18} />
                <strong>Recibo</strong>
                <span>O recibo fica marcado como cancelado e nao pode mais ser editado.</span>
              </article>
              <article>
                <CheckCircle2 size={18} />
                <strong>Financeiro</strong>
                <span>
                  {sale.receivableNumber
                    ? `O titulo ${sale.receivableNumber} sera cancelado e o valor recebido sera zerado.`
                    : "Nenhum titulo financeiro vinculado foi encontrado."}
                </span>
              </article>
              <article>
                <CheckCircle2 size={18} />
                <strong>Auditoria</strong>
                <span>O motivo, usuario e IDs dos estornos ficam registrados no historico.</span>
              </article>
            </div>

            <div className="controlled-cancel-summary">
              <div>
                <span>Itens</span>
                <strong>{sale.itemCount || 1}</strong>
              </div>
              <div>
                <span>Recebimentos</span>
                <strong>{sale.receiptCount || 0}</strong>
              </div>
              <div>
                <span>Status financeiro</span>
                <strong>{sale.receivableStatus || "Sem titulo"}</strong>
              </div>
            </div>

            <label className="field">
              <span>Motivo obrigatorio</span>
              <textarea
                className="form-input"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                rows={3}
                maxLength={240}
                placeholder="Ex.: venda lancada incorretamente, cliente desistiu, produto errado..."
              />
            </label>

            <footer>
              <button className="secondary-button" type="button" onClick={() => setShowCancelPanel(false)} disabled={canceling}>
                Manter venda
              </button>
              <button className="primary-button danger-action" type="button" onClick={cancelSale} disabled={canceling || cancelReason.trim().length < 3}>
                <RotateCcw size={16} />
                {canceling ? "Cancelando..." : "Cancelar e estornar"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
