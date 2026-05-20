"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";

type ItemOption = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
};

type PurchaseRequestFormProps = {
  items: ItemOption[];
};

export function PurchaseRequestForm({ items }: PurchaseRequestFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/suprimentos/solicitacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: formData.get("number"),
        department: formData.get("department") || undefined,
        costCenter: formData.get("costCenter") || undefined,
        priority: formData.get("priority"),
        neededAt: formData.get("neededAt") || undefined,
        justification: formData.get("justification") || undefined,
        itemId: formData.get("itemId"),
        quantity: formData.get("quantity"),
        note: formData.get("note") || undefined
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel criar a solicitacao.");
      return;
    }

    event.currentTarget.reset();
    setMessage("Solicitacao criada com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero</span>
        <input className="form-input mono" name="number" placeholder="SC-0001" required maxLength={40} />
      </label>

      <div className="form-two">
        <label className="field">
          <span>Departamento</span>
          <input className="form-input" name="department" placeholder="Producao" maxLength={80} />
        </label>
        <label className="field">
          <span>Centro de custo</span>
          <input className="form-input" name="costCenter" placeholder="Fabrica" maxLength={80} />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Prioridade</span>
          <select className="form-input" name="priority" defaultValue="NORMAL">
            <option value="BAIXA">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </label>
        <label className="field">
          <span>Necessario em</span>
          <input className="form-input mono" name="neededAt" type="date" />
        </label>
      </div>

      <label className="field">
        <span>Item</span>
        <select className="form-input" name="itemId" required defaultValue={items[0]?.id || ""}>
          {items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.code} - {item.description} ({item.unitCode})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Quantidade</span>
        <input className="form-input mono" name="quantity" type="number" min="0.001" step="0.001" required />
      </label>

      <label className="field">
        <span>Justificativa</span>
        <input className="form-input" name="justification" placeholder="Motivo da compra" maxLength={500} />
      </label>

      <label className="field">
        <span>Observacao do item</span>
        <input className="form-input" name="note" placeholder="Especificacao, marca, uso previsto..." maxLength={240} />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || items.length === 0}>
        <ClipboardList size={17} />
        {loading ? "Criando..." : "Criar solicitacao"}
      </button>
    </form>
  );
}
