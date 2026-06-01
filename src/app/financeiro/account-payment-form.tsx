"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { formatValidationError } from "@/lib/validations/client";
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
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const parsed = accountPaymentSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      return;
    }

    setLoading(true);
    const response = await fetch("/api/financeiro/pagamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel registrar o pagamento.");
      return;
    }

    setSuccess("Pagamento registrado e titulo atualizado.");
    event.currentTarget.reset();
    router.refresh();
  }

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
