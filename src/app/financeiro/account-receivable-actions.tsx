"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { formatValidationError } from "@/lib/validations/client";
import { accountReceivableUpdateSchema, accountReceiptReversalSchema } from "@/lib/validations/purchase";
import { formatMoney } from "@/lib/formatters";

type CustomerOption = {
  id: string;
  code: string;
  name: string;
};

type EditData = {
  customerId: string;
  description: string;
  documentNumber: string;
  costCenter: string;
  dueDate: string;
  amount: string;
  note: string;
};

type ReceiptOption = {
  id: string;
  receiptDate: string;
  amount: number;
  method: string;
  reference: string;
};

type Props = {
  receivableId: string;
  number: string;
  customers: CustomerOption[];
  editData: EditData;
  linkedToSale: boolean;
  hasReceipts: boolean;
  receipts: ReceiptOption[];
};

export function AccountReceivableActions({ receivableId, number, customers, editData, linkedToSale, hasReceipts, receipts }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const lockedDelete = linkedToSale || hasReceipts;
  const lockedCriticalFields = linkedToSale || hasReceipts;

  async function updateReceivable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading("editar");

    const payload = {
      customerId: formData.get("customerId"),
      description: formData.get("description"),
      documentNumber: formData.get("documentNumber") || undefined,
      costCenter: formData.get("costCenter") || undefined,
      dueDate: formData.get("dueDate"),
      amount: formData.get("amount"),
      note: formData.get("note") || undefined
    };
    const parsed = accountReceivableUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      setLoading("");
      return;
    }

    try {
      await fetchJson(`/api/financeiro/contas-receber/${receivableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, "Nao foi possivel editar a conta a receber.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel editar a conta a receber.");
      setLoading("");
      return;
    }

    setLoading("");
    setEditing(false);
    router.refresh();
  }

  async function deleteReceivable() {
    const confirmed = window.confirm("Excluir esta conta a receber? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    try {
      await fetchJson(`/api/financeiro/contas-receber/${receivableId}`, { method: "DELETE" }, "Nao foi possivel excluir a conta a receber.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel excluir a conta a receber.");
      setLoading("");
      return;
    }

    setLoading("");
    router.refresh();
  }

  async function reverseReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const receiptId = String(formData.get("receiptId") || "");
    setError("");
    setLoading("estornar");

    if (!receiptId) {
      setError("Selecione a baixa para estornar.");
      setLoading("");
      return;
    }

    const parsed = accountReceiptReversalSchema.safeParse({
      reason: formData.get("reason")
    });

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      setLoading("");
      return;
    }

    try {
      await fetchJson(`/api/financeiro/recebimentos/${receiptId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, "Nao foi possivel estornar a baixa financeira.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "Nao foi possivel estornar a baixa financeira.");
      setLoading("");
      return;
    }

    setLoading("");
    setReversing(false);
    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={() => setEditing((current) => !current)} disabled={Boolean(loading)}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button" type="button" onClick={() => setReversing((current) => !current)} disabled={!hasReceipts || Boolean(loading)}>
          <RotateCcw size={15} />
          Estornar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteReceivable} disabled={lockedDelete || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {editing ? (
        <form className="quote-edit-form" onSubmit={updateReceivable}>
          <div className="receipt-helper">
            <strong className="mono">{number}</strong>
            <p>{lockedCriticalFields ? "Titulo vinculado: cliente e valor ficam travados para rastreabilidade." : "Lancamento manual editavel."}</p>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Cliente</span>
              <select className="form-input" name="customerId" defaultValue={editData.customerId} disabled={lockedCriticalFields} required>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.code} - {customer.name}</option>
                ))}
              </select>
              {lockedCriticalFields ? <input type="hidden" name="customerId" value={editData.customerId} /> : null}
            </label>
            <label className="field">
              <span>Valor</span>
              <input className="form-input mono" name="amount" type="number" min="0.01" step="0.01" defaultValue={editData.amount} readOnly={lockedCriticalFields} required />
            </label>
          </div>

          <label className="field">
            <span>Descricao</span>
            <input className="form-input" name="description" defaultValue={editData.description} maxLength={160} required />
          </label>

          <div className="form-two">
            <label className="field">
              <span>Vencimento</span>
              <input className="form-input mono" name="dueDate" type="date" defaultValue={editData.dueDate} required />
            </label>
            <label className="field">
              <span>Documento</span>
              <input className="form-input mono" name="documentNumber" defaultValue={editData.documentNumber} maxLength={80} />
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Centro de custo</span>
              <input className="form-input" name="costCenter" defaultValue={editData.costCenter} maxLength={80} />
            </label>
            <label className="field">
              <span>Observacao</span>
              <input className="form-input" name="note" defaultValue={editData.note} maxLength={500} />
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button mini-button" type="submit" disabled={Boolean(loading)}>
              <Save size={15} />
              Salvar
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setEditing(false)} disabled={Boolean(loading)}>
              <X size={15} />
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {reversing ? (
        <form className="quote-edit-form" onSubmit={reverseReceipt}>
          <div className="receipt-helper">
            <strong className="mono">{number}</strong>
            <p>Estorne uma baixa para reabrir o saldo do titulo. Informe o motivo para auditoria.</p>
          </div>

          <label className="field">
            <span>Baixa financeira</span>
            <select className="form-input" name="receiptId" required defaultValue={receipts[0]?.id || ""}>
              {receipts.map((receipt) => (
                <option key={receipt.id} value={receipt.id}>
                  {receipt.receiptDate} - {formatMoney(receipt.amount)} - {receipt.method}{receipt.reference ? ` - ${receipt.reference}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Motivo do estorno</span>
            <textarea className="form-input" name="reason" rows={2} maxLength={500} placeholder="Ex.: baixa lancada no titulo errado, valor incorreto..." required />
          </label>

          <div className="button-row">
            <button className="primary-button mini-button" type="submit" disabled={Boolean(loading)}>
              <RotateCcw size={15} />
              Estornar baixa
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setReversing(false)} disabled={Boolean(loading)}>
              <X size={15} />
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {lockedDelete ? <small className="metric-sub">Exclusao travada por venda ou baixa.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
