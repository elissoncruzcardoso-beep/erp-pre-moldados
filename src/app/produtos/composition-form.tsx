"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";

export type CompositionProductOption = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
  curingHours: number;
};

export type CompositionMaterialOption = {
  id: string;
  code: string;
  description: string;
  unitCode: string;
  stockQuantity: number;
  standardCost?: number;
};

type CompositionLine = {
  itemId: string;
  quantity: string;
  lossPercent: string;
  stage: string;
};

type CompositionInitialData = {
  code: string;
  productId: string;
  version: string;
  revision: string;
  baseQuantity: string;
  expectedLoss: string;
  curingHours: string;
  approved: boolean;
  items: CompositionLine[];
};

type Props = {
  products: CompositionProductOption[];
  materials: CompositionMaterialOption[];
  mode?: "create" | "edit";
  compositionId?: string;
  initialData?: CompositionInitialData;
};

function makeCompositionCode(product?: CompositionProductOption) {
  const suffix = product?.code || "PECA";
  return `COMP-${suffix}`.slice(0, 40);
}

function emptyLine(materials: CompositionMaterialOption[]): CompositionLine {
  return { itemId: materials[0]?.id || "", quantity: "", lossPercent: "0", stage: "Concreto" };
}

export function CompositionForm({ products, materials, mode = "create", compositionId, initialData }: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [productId, setProductId] = useState(initialData?.productId || products[0]?.id || "");
  const [curingHours, setCuringHours] = useState(initialData?.curingHours || String(products[0]?.curingHours ?? 24));
  const [lines, setLines] = useState<CompositionLine[]>(
    initialData?.items?.length ? initialData.items : [emptyLine(materials)]
  );
  const [approved, setApproved] = useState(initialData?.approved || false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const productsById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const materialsById = useMemo(() => {
    return new Map(materials.map((material) => [material.id, material]));
  }, [materials]);

  const selectedProduct = productsById.get(productId);
  const suggestedCode = useMemo(() => makeCompositionCode(selectedProduct), [selectedProduct]);
  const compositionTotal = useMemo(() => {
    return lines.reduce((total, line) => {
      const material = materialsById.get(line.itemId);
      const quantity = Number(line.quantity || 0);
      const lossPercent = Number(line.lossPercent || 0);
      const unitCost = material?.standardCost || 0;

      return total + quantity * (1 + lossPercent / 100) * unitCost;
    }, 0);
  }, [lines, materialsById]);

  function updateLine(index: number, field: keyof CompositionLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line)
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(materials)]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setMessage("");
    setLoading(true);

    const response = await fetch(isEdit ? `/api/produtos/composicoes/${compositionId}` : "/api/produtos/composicoes", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: formData.get("code"),
        productId,
        version: formData.get("version") || "1",
        revision: formData.get("revision") || "A",
        baseQuantity: formData.get("baseQuantity") || 1,
        expectedLoss: formData.get("expectedLoss") || 0,
        curingHours: formData.get("curingHours") || selectedProduct?.curingHours || 24,
        approved,
        items: lines
          .filter((line) => line.itemId && Number(line.quantity) > 0)
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            lossPercent: line.lossPercent || 0,
            stage: line.stage || undefined
          }))
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || (isEdit ? "Nao foi possivel editar a ficha tecnica." : "Nao foi possivel criar a ficha tecnica."));
      return;
    }

    if (!isEdit) {
      form.reset();
      setApproved(false);
      setLines([emptyLine(materials)]);
    }

    setMessage(isEdit ? "Ficha tecnica atualizada com sucesso." : "Ficha tecnica criada com sucesso.");
    router.push("/produtos");
    router.refresh();
  }

  return (
    <form className="composition-builder-form" onSubmit={handleSubmit}>
      <section className="composition-builder-card">
        <div className="composition-builder-head">
          <div>
            <p className="eyebrow">Produto final</p>
            <h2>{isEdit ? "Editar dados da composicao" : "Dados da composicao"}</h2>
          </div>
          <span className="badge blue">Base tecnica</span>
        </div>

        <div className="composition-product-fields">
          <label className="field span-wide">
            <span>Peca / produto</span>
            <select
              className="form-input"
              value={productId}
              onChange={(event) => {
                const nextProductId = event.target.value;
                const nextProduct = productsById.get(nextProductId);
                setProductId(nextProductId);
                if (!isEdit) {
                  setCuringHours(String(nextProduct?.curingHours ?? 24));
                }
              }}
              required
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.description}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Unidade</span>
            <input className="form-input mono" value={selectedProduct?.unitCode || ""} readOnly />
          </label>
          <label className="field">
            <span>Codigo da ficha</span>
            <input className="form-input mono" name="code" defaultValue={initialData?.code || suggestedCode} placeholder="Automatico se vazio" maxLength={40} />
          </label>
          <label className="field">
            <span>Versao</span>
            <input className="form-input mono" name="version" defaultValue={initialData?.version || "1"} required maxLength={20} />
          </label>
          <label className="field">
            <span>Revisao</span>
            <input className="form-input mono" name="revision" defaultValue={initialData?.revision || "A"} required maxLength={20} />
          </label>
          <label className="field">
            <span>Base de producao</span>
            <input className="form-input mono" name="baseQuantity" type="number" min="0.001" step="0.001" defaultValue={initialData?.baseQuantity || "1"} required />
          </label>
          <label className="field">
            <span>Perda esperada %</span>
            <input className="form-input mono" name="expectedLoss" type="number" min="0" max="100" step="0.001" defaultValue={initialData?.expectedLoss || "0"} />
          </label>
          <label className="field">
            <span>Tempo de cura da ficha (horas)</span>
            <input
              className="form-input mono"
              name="curingHours"
              type="number"
              min="0"
              max="720"
              step="1"
              value={curingHours}
              onChange={(event) => setCuringHours(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="composition-builder-card composition-grid-card">
        <div className="composition-builder-head">
          <div>
            <p className="eyebrow">Composicao</p>
            <h2>Itens da ficha tecnica</h2>
          </div>
          <button className="secondary-button mini-button" type="button" onClick={addLine} disabled={materials.length === 0}>
            <Plus size={14} />
            Insumo
          </button>
        </div>

        <div className="composition-entry-table">
          <div className="composition-entry-row composition-entry-head">
            <span>Codigo</span>
            <span>Descricao</span>
            <span>Unidade</span>
            <span>Quantidade*</span>
            <span>Perda %</span>
            <span>Custo unitario</span>
            <span>Total</span>
            <span>Acoes</span>
          </div>

          {lines.map((line, index) => {
            const material = materialsById.get(line.itemId);
            const quantity = Number(line.quantity || 0);
            const lossPercent = Number(line.lossPercent || 0);
            const unitCost = material?.standardCost || 0;
            const lineTotal = quantity * (1 + lossPercent / 100) * unitCost;

            return (
              <div className="composition-entry-row" key={`${index}-${line.itemId}`}>
                <span className="mono">{material?.code || "-"}</span>
                <label className="field compact-field">
                  <span>Descricao</span>
                  <select className="form-input" value={line.itemId} onChange={(event) => updateLine(index, "itemId", event.target.value)} required>
                    {materials.map((materialOption) => (
                      <option key={materialOption.id} value={materialOption.id}>
                        {materialOption.code} - {materialOption.description}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="mono">{material?.unitCode || "-"}</span>
                <input className="form-input mono" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required />
                <input className="form-input mono" type="number" min="0" max="100" step="0.001" value={line.lossPercent} onChange={(event) => updateLine(index, "lossPercent", event.target.value)} />
                <span className="mono">{unitCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                <strong className="mono">{lineTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                <button className="icon-button daily-remove" type="button" onClick={() => removeLine(index)} disabled={lines.length === 1} aria-label="Remover insumo">
                  <Trash2 size={16} />
                </button>
                <label className="field composition-stage-field">
                  <span>Etapa</span>
                  <input className="form-input" value={line.stage} onChange={(event) => updateLine(index, "stage", event.target.value)} placeholder="Concreto, armadura..." maxLength={80} />
                </label>
              </div>
            );
          })}
        </div>

        <div className="composition-entry-footer">
          <span>Quantidade de registros: {lines.length}</span>
          <strong>Total estimado: {compositionTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
        </div>
      </section>

      <section className="composition-save-bar">
        <label className="check-inline">
          <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
          Liberar ficha para producao
        </label>
        <div className="button-row">
          <a className="secondary-button" href="/produtos">Cancelar</a>
          <button className="primary-button" type="submit" disabled={loading || products.length === 0 || materials.length === 0}>
            <ClipboardList size={17} />
            {loading ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Salvar"}
          </button>
        </div>
      </section>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}
    </form>
  );
}
