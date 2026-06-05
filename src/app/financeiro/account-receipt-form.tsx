"use client";

import { CircleDollarSign } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { accountReceiptSchema } from "@/lib/validations/purchase";

type ReceivableOption = {
  id: string;
  number: string;
  customer: string;
  remainingAmount: number;
};

type Props = {
  receivables: ReceivableOption[];
};

export function AccountReceiptForm({ receivables }: Props) {
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/financeiro/recebimentos",
    schema: accountReceiptSchema,
    fallbackError: "Nao foi possivel registrar o recebimento.",
    successMessage: "Recebimento registrado e titulo atualizado."
  });

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Titulo em aberto</span>
        <select className="form-input" name="accountReceivableId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {receivables.map((receivable) => (
            <option key={receivable.id} value={receivable.id}>
              {receivable.number} - {receivable.customer} - saldo {receivable.remainingAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Data recebimento</span>
          <input className="form-input mono" name="receiptDate" type="date" required />
        </label>
        <label className="field">
          <span>Valor recebido</span>
          <input className="form-input mono" name="amount" type="number" min="0.01" step="0.01" required />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Forma</span>
          <select className="form-input" name="method" defaultValue="PIX" required>
            <option value="PIX">PIX</option>
            <option value="BOLETO">Boleto</option>
            <option value="TED">TED</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="OUTRO">Outro</option>
          </select>
        </label>
        <label className="field">
          <span>Referencia</span>
          <input className="form-input mono" name="reference" maxLength={120} placeholder="Comprovante / banco" />
        </label>
      </div>

      <label className="field">
        <span>Observacao</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Observacao do recebimento, cobranca ou comprovante..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || receivables.length === 0}>
        <CircleDollarSign size={17} />
        {loading ? "Recebendo..." : "Registrar recebimento"}
      </button>
    </form>
  );
}
