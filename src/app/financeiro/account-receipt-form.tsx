"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import { formatValidationError } from "@/lib/validations/client";
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
    const parsed = accountReceiptSchema.safeParse(payload);

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      return;
    }

    setLoading(true);
    const response = await fetch("/api/financeiro/recebimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel registrar o recebimento.");
      return;
    }

    setSuccess("Recebimento registrado e titulo atualizado.");
    event.currentTarget.reset();
    router.refresh();
  }

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
        <textarea className="form-input" name="note" rows={3} placeholder="Observacao do recebimento, cobrança ou comprovante..." />
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
