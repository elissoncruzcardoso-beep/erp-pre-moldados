"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type Option = {
  id: string;
  label: string;
};

type ProductionOrderFormProps = {
  products: Option[];
  molds: Option[];
  compositions: (Option & { productId: string })[];
};

export function ProductionOrderForm({ products, molds, compositions }: ProductionOrderFormProps) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const availableCompositions = compositions.filter((composition) => composition.productId === selectedProductId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/producao/ordens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: formData.get("number"),
        productId: selectedProductId,
        compositionId: formData.get("compositionId") || undefined,
        moldId: formData.get("moldId") || undefined,
        plannedQuantity: formData.get("plannedQuantity"),
        expectedDate: formData.get("expectedDate") || undefined
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel criar a ordem de producao.");
      return;
    }

    event.currentTarget.reset();
    setMessage("Ordem de producao criada com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Numero da OP</span>
        <input className="form-input mono" name="number" placeholder="Automatico se vazio" maxLength={40} />
      </label>

      <label className="field">
        <span>Produto</span>
        <select
          className="form-input"
          value={selectedProductId}
          onChange={(event) => setSelectedProductId(event.target.value)}
          required
        >
          {products.map((product) => (
            <option value={product.id} key={product.id}>
              {product.label}
            </option>
          ))}
        </select>
      </label>

      <div className="form-two">
        <label className="field">
          <span>Quantidade planejada</span>
          <input className="form-input mono" name="plannedQuantity" type="number" min="0.001" step="0.001" required />
        </label>
        <label className="field">
          <span>Entrega prevista</span>
          <input className="form-input mono" name="expectedDate" type="date" />
        </label>
      </div>

      <label className="field">
        <span>Ficha tecnica</span>
        <select className="form-input" name="compositionId" defaultValue="">
          <option value="">Sem ficha vinculada</option>
          {availableCompositions.map((composition) => (
            <option value={composition.id} key={composition.id}>
              {composition.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Forma/molde</span>
        <select className="form-input" name="moldId" defaultValue="">
          <option value="">Sem molde definido</option>
          {molds.map((mold) => (
            <option value={mold.id} key={mold.id}>
              {mold.label}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || products.length === 0}>
        <Plus size={17} />
        {loading ? "Criando..." : "Criar OP"}
      </button>
    </form>
  );
}
