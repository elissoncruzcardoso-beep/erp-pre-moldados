"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSearch, Plus, Trash2 } from "lucide-react";

type RequestOption = {
  id: string;
  number: string;
  item: string;
  items: string[];
  requestItems: {
    id: string;
    itemId: string;
    label: string;
    quantity: number;
    unitCode: string;
    note: string;
  }[];
  status: string;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type SupplierQuoteLine = {
  id: string;
};

type Props = {
  requests: RequestOption[];
  suppliers: SupplierOption[];
};

function makeQuoteNumber() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `COT-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

export function PurchaseQuoteForm({ requests, suppliers }: Props) {
  const router = useRouter();
  const [quoteNumber, setQuoteNumber] = useState(makeQuoteNumber);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuoteLine[]>([{ id: "fornecedor-1" }]);
  const selectedRequest = requests.find((request) => request.id === selectedRequestId);

  function addSupplierQuote() {
    setSupplierQuotes((current) => {
      if (current.length >= 3) return current;
      return [...current, { id: `fornecedor-${Date.now()}` }];
    });
  }

  function removeSupplierQuote(id: string) {
    setSupplierQuotes((current) => current.filter((quote) => quote.id !== id));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedRequest) {
      setError("Selecione uma solicitacao para cotar.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const filledSupplierIds = supplierQuotes
      .map((quote) => String(formData.get(`supplierId-${quote.id}`) || ""))
      .filter(Boolean);
    const uniqueSupplierIds = new Set(filledSupplierIds);

    if (filledSupplierIds.length === 0) {
      setError("Informe pelo menos um fornecedor.");
      return;
    }

    if (filledSupplierIds.length !== uniqueSupplierIds.size) {
      setError("Use fornecedores diferentes no comparativo.");
      return;
    }

    setLoading(true);

    for (let index = 0; index < supplierQuotes.length; index += 1) {
      const supplierQuote = supplierQuotes[index];
      const supplierId = String(formData.get(`supplierId-${supplierQuote.id}`) || "");

      if (!supplierId) continue;
      const manualQuoteNumber = quoteNumber.trim();

      const payload = {
        number: manualQuoteNumber
          ? supplierQuotes.length > 1 ? `${manualQuoteNumber}-F${index + 1}` : manualQuoteNumber
          : undefined,
        purchaseRequestId: selectedRequestId,
        supplierId,
        deliveryDays: formData.get(`deliveryDays-${supplierQuote.id}`) || undefined,
        paymentTerms: formData.get(`paymentTerms-${supplierQuote.id}`) || undefined,
        validUntil: formData.get(`validUntil-${supplierQuote.id}`) || undefined,
        freightCost: formData.get(`freightCost-${supplierQuote.id}`) || 0,
        note: formData.get(`note-${supplierQuote.id}`) || undefined,
        items: selectedRequest.requestItems.map((item) => ({
          purchaseRequestItemId: item.id,
          itemId: item.itemId,
          supplierId,
          quantity: item.quantity,
          unitPrice: formData.get(`unitPrice-${supplierQuote.id}-${item.id}`) || 0,
          discountValue: formData.get(`discountValue-${supplierQuote.id}-${item.id}`) || 0,
          freightCost: formData.get(`lineFreightCost-${supplierQuote.id}-${item.id}`) || 0,
          note: formData.get(`itemNote-${supplierQuote.id}-${item.id}`) || undefined
        }))
      };

      const response = await fetch("/api/suprimentos/cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setLoading(false);
        setError(data?.error || `Nao foi possivel registrar a cotacao do fornecedor ${index + 1}.`);
        return;
      }
    }

    setLoading(false);
    setSuccess(`${filledSupplierIds.length} cotacao(oes) registrada(s) para comparativo.`);
    form.reset();
    setQuoteNumber(makeQuoteNumber());
    setSelectedRequestId("");
    setSupplierQuotes([{ id: "fornecedor-1" }]);
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero base da cotacao</span>
        <input
          className="form-input"
          value={quoteNumber}
          onChange={(event) => setQuoteNumber(event.target.value)}
          placeholder="Automatico se vazio"
        />
      </label>

      <label className="field">
        <span>Solicitacao</span>
        <select
          className="form-input"
          name="purchaseRequestId"
          required
          value={selectedRequestId}
          onChange={(event) => setSelectedRequestId(event.target.value)}
        >
          <option value="" disabled>Selecione</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.number} - {request.item} ({request.status})
            </option>
          ))}
        </select>
      </label>

      {selectedRequest ? (
        <div className="request-items-preview">
          <span className="mono">Itens da solicitacao</span>
          {selectedRequest.items.map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      ) : null}

      {selectedRequest ? (
        <div className="quote-supplier-stack">
          <div className="metric-top">
            <span className="mono">Fornecedores cotados</span>
            <button className="secondary-button mini-button" type="button" onClick={addSupplierQuote} disabled={supplierQuotes.length >= 3}>
              <Plus size={14} />
              Fornecedor
            </button>
          </div>

          {supplierQuotes.map((supplierQuote, supplierIndex) => (
            <section className="quote-supplier-card" key={supplierQuote.id}>
              <div className="metric-top">
                <strong>Fornecedor {supplierIndex + 1}</strong>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => removeSupplierQuote(supplierQuote.id)}
                  disabled={supplierQuotes.length === 1}
                  aria-label="Remover fornecedor"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <label className="field">
                <span>Fornecedor</span>
                <select className="form-input" name={`supplierId-${supplierQuote.id}`} required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code} - {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="quote-item-lines">
                {selectedRequest.requestItems.map((item) => (
                  <div className="quote-item-line quote-comparison-line" key={`${supplierQuote.id}-${item.id}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <small>
                        {item.quantity.toLocaleString("pt-BR")} {item.unitCode}
                        {item.note ? ` - ${item.note}` : ""}
                      </small>
                    </div>

                    <label className="field">
                      <span>Preco unit.</span>
                      <input className="form-input mono" name={`unitPrice-${supplierQuote.id}-${item.id}`} type="number" min="0" step="0.01" required />
                    </label>

                    <label className="field">
                      <span>Desconto</span>
                      <input className="form-input mono" name={`discountValue-${supplierQuote.id}-${item.id}`} type="number" min="0" step="0.01" defaultValue="0" />
                    </label>

                    <label className="field">
                      <span>Frete item</span>
                      <input className="form-input mono" name={`lineFreightCost-${supplierQuote.id}-${item.id}`} type="number" min="0" step="0.01" defaultValue="0" />
                    </label>

                    <label className="field">
                      <span>Obs.</span>
                      <input className="form-input" name={`itemNote-${supplierQuote.id}-${item.id}`} placeholder="Marca, condicao ou prazo especifico" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="form-two">
                <label className="field">
                  <span>Frete geral</span>
                  <input className="form-input" name={`freightCost-${supplierQuote.id}`} type="number" min="0" step="0.01" defaultValue="0" />
                </label>
                <label className="field">
                  <span>Prazo entrega (dias)</span>
                  <input className="form-input" name={`deliveryDays-${supplierQuote.id}`} type="number" min="0" step="1" />
                </label>
              </div>

              <div className="form-two">
                <label className="field">
                  <span>Validade</span>
                  <input className="form-input" name={`validUntil-${supplierQuote.id}`} type="date" />
                </label>
                <label className="field">
                  <span>Condicao de pagamento</span>
                  <input className="form-input" name={`paymentTerms-${supplierQuote.id}`} placeholder="Ex.: 28 dias, boleto" />
                </label>
              </div>

              <label className="field">
                <span>Observacao do fornecedor</span>
                <textarea className="form-input" name={`note-${supplierQuote.id}`} rows={2} placeholder="Prazo, impostos, condicoes comerciais..." />
              </label>
            </section>
          ))}
        </div>
      ) : null}

      {error ? <p className="auth-error">{error}</p> : null}
      {success ? <p className="auth-success">{success}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || requests.length === 0 || suppliers.length === 0 || !selectedRequest}>
        <FileSearch size={17} />
        {loading ? "Registrando..." : "Registrar comparativo"}
      </button>
    </form>
  );
}
