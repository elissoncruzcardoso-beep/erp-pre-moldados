"use client";

import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { accountPayableSchema } from "@/lib/validations/purchase";

type ReceiptOption = {
  id: string;
  number: string;
  supplier: string;
  document: string;
  amount: number;
};

type Props = {
  receipts: ReceiptOption[];
};

export function AccountPayableForm({ receipts }: Props) {
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/financeiro/contas-pagar",
    schema: accountPayableSchema,
    fallbackError: "Nao foi possivel gerar a conta a pagar.",
    successMessage: "Conta a pagar gerada a partir do recebimento."
  });

  const nextNumber = useMemo(() => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `CP-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
  }, []);

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <div className="form-two">
        <label className="field">
          <span>Titulo</span>
          <input className="form-input mono" name="number" defaultValue={nextNumber} placeholder="Automatico se vazio" />
        </label>
        <label className="field">
          <span>Vencimento</span>
          <input className="form-input mono" name="dueDate" type="date" required />
        </label>
      </div>

      <label className="field">
        <span>Recebimento / NF</span>
        <select className="form-input" name="purchaseReceiptId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {receipts.map((receipt) => (
            <option key={receipt.id} value={receipt.id}>
              {receipt.number} - {receipt.supplier} - {receipt.document} - {receipt.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Centro de custo</span>
        <input className="form-input" name="costCenter" maxLength={80} placeholder="Producao / Fabrica" />
      </label>

      <label className="field">
        <span>Observacao</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Condicao, aprovacao, boleto ou observacao financeira..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || receipts.length === 0}>
        <FilePlus2 size={17} />
        {loading ? "Gerando..." : "Gerar conta a pagar"}
      </button>
    </form>
  );
}
