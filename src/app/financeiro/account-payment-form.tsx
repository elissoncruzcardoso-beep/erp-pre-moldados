"use client";

import { CheckCircle2 } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { accountPaymentSchema } from "@/lib/validations/purchase";

type PayableOption = {
  id: string;
  number: string;
  supplier: string;
  remainingAmount: number;
};

type Props = {
  payables: PayableOption[];
};

export function AccountPaymentForm({ payables }: Props) {
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/financeiro/pagamentos",
    schema: accountPaymentSchema,
    fallbackError: "Nao foi possivel registrar o pagamento.",
    successMessage: "Pagamento registrado e titulo atualizado."
  });

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Titulo em aberto</span>
        <select className="form-input" name="accountPayableId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {payables.map((payable) => (
            <option key={payable.id} value={payable.id}>
              {payable.number} - {payable.supplier} - saldo {payable.remainingAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Data pagamento</span>
          <input className="form-input mono" name="paymentDate" type="date" required />
        </label>
        <label className="field">
          <span>Valor pago</span>
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
        <textarea className="form-input" name="note" rows={3} placeholder="Observacao da baixa, comprovante ou aprovador..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || payables.length === 0}>
        <CheckCircle2 size={17} />
        {loading ? "Baixando..." : "Registrar baixa"}
      </button>
    </form>
  );
}
