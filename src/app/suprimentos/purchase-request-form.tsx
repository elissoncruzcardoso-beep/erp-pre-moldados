"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";

type ItemOption = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
};

type PurchaseRequestFormProps = {
  items: ItemOption[];
};

type RequestLine = {
  itemId: string;
  quantity: string;
  note: string;
};

export function PurchaseRequestForm({ items }: PurchaseRequestFormProps) {
  const router = useRouter();
  const [lines, setLines] = useState<RequestLine[]>([
    { itemId: items[0]?.id || "", quantity: "", note: "" }
  ]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function updateLine(index: number, field: keyof RequestLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line)
    );
  }

  function addLine() {
    setLines((current) => [...current, { itemId: items[0]?.id || "", quantity: "", note: "" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(form);
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
        items: lines
          .filter((line) => line.itemId && Number(line.quantity) > 0)
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            note: line.note || undefined
          }))
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel criar a solicitacao.");
      return;
    }

    form.reset();
    setLines([{ itemId: items[0]?.id || "", quantity: "", note: "" }]);
    setMessage("Solicitacao criada com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero</span>
        <input className="form-input mono" name="number" placeholder="Automatico se vazio" maxLength={40} />
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
        <span>Justificativa</span>
        <input className="form-input" name="justification" placeholder="Motivo da compra" maxLength={500} />
      </label>

      <div className="daily-lines">
        <div className="metric-top">
          <span className="mono">Itens da solicitacao</span>
          <button className="secondary-button mini-button" type="button" onClick={addLine} disabled={items.length === 0}>
            <Plus size={14} />
            Item
          </button>
        </div>

        {lines.map((line, index) => (
          <div className="purchase-line" key={`${index}-${line.itemId}`}>
            <label className="field">
              <span>Item</span>
              <select
                className="form-input"
                value={line.itemId}
                onChange={(event) => updateLine(index, "itemId", event.target.value)}
                required
              >
                {items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.code} - {item.description} ({item.unitCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Quantidade</span>
              <input
                className="form-input mono"
                type="number"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(event) => updateLine(index, "quantity", event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Observacao</span>
              <input
                className="form-input"
                value={line.note}
                onChange={(event) => updateLine(index, "note", event.target.value)}
                placeholder="Especificacao, marca, uso previsto..."
                maxLength={240}
              />
            </label>

            <button
              className="icon-button daily-remove"
              type="button"
              onClick={() => removeLine(index)}
              disabled={lines.length === 1}
              aria-label="Remover item"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || items.length === 0}>
        <ClipboardList size={17} />
        {loading ? "Criando..." : "Criar solicitacao"}
      </button>
    </form>
  );
}
