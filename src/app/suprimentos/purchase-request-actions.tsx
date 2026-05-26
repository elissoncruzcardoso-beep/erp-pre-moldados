"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";

type ItemOption = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
};

type RequestLine = {
  itemId: string;
  quantity: string;
  note: string;
};

type EditData = {
  id: string;
  number: string;
  department: string;
  costCenter: string;
  priority: string;
  neededAt: string;
  justification: string;
  items: RequestLine[];
};

type Props = {
  requestId: string;
  locked: boolean;
  items: ItemOption[];
  editData: EditData;
};

export function PurchaseRequestActions({ requestId, locked, items, editData }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<RequestLine[]>(editData.items.length > 0 ? editData.items : [{ itemId: items[0]?.id || "", quantity: "", note: "" }]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

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

  function openEdit() {
    setLines(editData.items.length > 0 ? editData.items : [{ itemId: items[0]?.id || "", quantity: "", note: "" }]);
    setEditing(true);
    setError("");
  }

  async function updateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setLoading("editar");

    const response = await fetch(`/api/suprimentos/solicitacoes/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel editar a solicitacao.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function deleteRequest() {
    const confirmed = window.confirm("Excluir esta solicitacao? Esta acao nao pode ser desfeita.");

    if (!confirmed) return;

    setError("");
    setLoading("excluir");

    const response = await fetch(`/api/suprimentos/solicitacoes/${requestId}`, {
      method: "DELETE"
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok) {
      setError(data?.error || "Nao foi possivel excluir a solicitacao.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <div className="button-row compact-actions">
        <button className="secondary-button mini-button" type="button" onClick={openEdit} disabled={locked || Boolean(loading)}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="secondary-button mini-button danger-text" type="button" onClick={deleteRequest} disabled={locked || Boolean(loading)}>
          <Trash2 size={15} />
          Excluir
        </button>
      </div>

      {editing ? (
        <form className="quote-edit-form" onSubmit={updateRequest}>
          <div className="receipt-helper">
            <strong className="mono">{editData.number}</strong>
            <p>Numero gerado automaticamente. Nao e editavel.</p>
          </div>
          <div className="form-two">
            <label className="field">
              <span>Prioridade</span>
              <select className="form-input" name="priority" defaultValue={editData.priority}>
                <option value="BAIXA">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Departamento</span>
              <input className="form-input" name="department" defaultValue={editData.department} maxLength={80} />
            </label>
            <label className="field">
              <span>Centro de custo</span>
              <input className="form-input" name="costCenter" defaultValue={editData.costCenter} maxLength={80} />
            </label>
          </div>

          <div className="form-two">
            <label className="field">
              <span>Necessario em</span>
              <input className="form-input mono" name="neededAt" type="date" defaultValue={editData.neededAt} />
            </label>
            <label className="field">
              <span>Justificativa</span>
              <input className="form-input" name="justification" defaultValue={editData.justification} maxLength={500} />
            </label>
          </div>

          <div className="daily-lines">
            <div className="metric-top">
              <span className="mono">Itens</span>
              <button className="secondary-button mini-button" type="button" onClick={addLine} disabled={items.length === 0}>
                <Plus size={14} />
                Item
              </button>
            </div>

            {lines.map((line, index) => (
              <div className="purchase-line" key={`${index}-${line.itemId}`}>
                <label className="field">
                  <span>Item</span>
                  <select className="form-input" value={line.itemId} onChange={(event) => updateLine(index, "itemId", event.target.value)} required>
                    {items.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.code} - {item.description} ({item.unitCode})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Quantidade</span>
                  <input className="form-input mono" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required />
                </label>

                <label className="field">
                  <span>Observacao</span>
                  <input className="form-input" value={line.note} onChange={(event) => updateLine(index, "note", event.target.value)} maxLength={240} />
                </label>

                <button className="icon-button daily-remove" type="button" onClick={() => removeLine(index)} disabled={lines.length === 1} aria-label="Remover item">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="button-row">
            <button className="primary-button mini-button" type="submit" disabled={Boolean(loading)}>
              <Save size={15} />
              Salvar
            </button>
            <button className="secondary-button mini-button" type="button" onClick={() => setEditing(false)} disabled={Boolean(loading)}>
              <X size={15} />
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {locked ? <small className="metric-sub">Travada por cotacao/pedido.</small> : null}
      {loading ? <small className="mono">Processando...</small> : null}
      {error ? <small className="action-error">{error}</small> : null}
    </div>
  );
}
