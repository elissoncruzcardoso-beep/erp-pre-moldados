"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileSearch } from "lucide-react";

type RequestOption = {
  id: string;
  number: string;
  item: string;
  status: string;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  requests: RequestOption[];
  suppliers: SupplierOption[];
};

export function PurchaseQuoteForm({ requests, suppliers }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const nextNumber = useMemo(() => {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `COT-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch("/api/suprimentos/cotacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel criar a cotacao.");
      return;
    }

    setSuccess("Cotacao registrada e solicitacao enviada para cotacao.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero da cotacao</span>
        <input className="form-input" name="number" defaultValue={nextNumber} required />
      </label>

      <label className="field">
        <span>Solicitacao</span>
        <select className="form-input" name="purchaseRequestId" required defaultValue="">
          <option value="" disabled>Selecione</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.number} - {request.item} ({request.status})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Fornecedor</span>
        <select className="form-input" name="supplierId" required defaultValue="">
          <option value="" disabled>Selecione</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.code} - {supplier.name}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Valor total</span>
          <input className="form-input" name="totalValue" type="number" min="0.01" step="0.01" required />
        </label>
        <label className="field">
          <span>Frete</span>
          <input className="form-input" name="freightCost" type="number" min="0" step="0.01" defaultValue="0" />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Prazo entrega (dias)</span>
          <input className="form-input" name="deliveryDays" type="number" min="0" step="1" />
        </label>
        <label className="field">
          <span>Validade</span>
          <input className="form-input" name="validUntil" type="date" />
        </label>
      </div>

      <label className="field">
        <span>Condicao de pagamento</span>
        <input className="form-input" name="paymentTerms" placeholder="Ex.: 28 dias, boleto" />
      </label>

      <label className="field">
        <span>Observacao</span>
        <textarea className="form-input" name="note" rows={3} placeholder="Prazo, impostos, condicoes comerciais..." />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || requests.length === 0 || suppliers.length === 0}>
        <FileSearch size={17} />
        {loading ? "Registrando..." : "Registrar cotacao"}
      </button>
    </form>
  );
}
