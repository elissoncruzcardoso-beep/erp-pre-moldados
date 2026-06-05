"use client";

import { useMemo } from "react";
import { CircleDollarSign } from "lucide-react";
import { useApiForm } from "@/lib/hooks/use-api-form";
import { accountReceivableSchema } from "@/lib/validations/purchase";

type CustomerOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  customers: CustomerOption[];
};

export function AccountReceivableForm({ customers }: Props) {
  const { error, success, loading, handleSubmit } = useApiForm({
    endpoint: "/api/financeiro/contas-receber",
    schema: accountReceivableSchema,
    fallbackError: "Nao foi possivel gerar a conta a receber.",
    successMessage: "Conta a receber criada."
  });

  const nextNumber = useMemo(() => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `CR-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
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
        <span>Cliente</span>
        <select className="form-input" name="customerId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} - {customer.name}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Valor</span>
          <input className="form-input mono" name="amount" type="number" min="0.01" step="0.01" required />
        </label>
        <label className="field">
          <span>Documento</span>
          <input className="form-input mono" name="documentNumber" maxLength={80} placeholder="NF / medicao" />
        </label>
      </div>

      <label className="field">
        <span>Descricao</span>
        <input className="form-input" name="description" maxLength={160} placeholder="Ex.: Medicao de pilares obra norte" required />
      </label>

      <label className="field">
        <span>Centro de custo</span>
        <input className="form-input" name="costCenter" maxLength={80} placeholder="Obra / contrato" />
      </label>

      <label className="field">
        <span>Observacao</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Condicao, contrato, medicao ou observacao..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || customers.length === 0}>
        <CircleDollarSign size={17} />
        {loading ? "Gerando..." : "Criar conta a receber"}
      </button>
    </form>
  );
}
