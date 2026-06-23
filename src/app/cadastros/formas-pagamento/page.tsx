import { CreditCard, ShieldCheck } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { TABLE_PAGE_LIMIT } from "@/lib/query-limits";
import { BaseCrudActions } from "../_components/base-crud-actions";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";

export const dynamic = "force-dynamic";

const paymentTypes = [
  { value: "A_VISTA", label: "A vista" },
  { value: "A_PRAZO", label: "A prazo" },
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartao" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OUTRO", label: "Outro" }
];

export default async function FormasPagamentoPage() {
  const session = await requirePageSession({ nextPath: "/cadastros/formas-pagamento", permission: "cadastros.manage" });

  const prisma = getPrisma();
  const paymentMethods = await prisma.paymentMethod.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: TABLE_PAGE_LIMIT
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros financeiros</p>
          <h1>Formas de pagamento</h1>
          <p className="lead">Padronize Pix, dinheiro, boleto, cartao e outras formas usadas em vendas e baixas.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/formas-pagamento" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Nova forma</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/formas-pagamento"
            submitLabel="Salvar forma"
            successMessage="Forma de pagamento salva com sucesso."
            formType="paymentMethod"
          >
            <label className="field">
              <span>Codigo</span>
              <input className="form-input mono" name="code" placeholder="PIX, DINHEIRO" maxLength={30} required />
            </label>
            <label className="field">
              <span>Nome</span>
              <input className="form-input" name="name" placeholder="Pix, Dinheiro, Cartao..." maxLength={90} required />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="form-input" name="type" defaultValue="A_VISTA">
                {paymentTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Observacao</span>
              <input className="form-input" name="note" maxLength={300} />
            </label>
          </BaseRegisterForm>
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lista</p>
              <h2>Formas cadastradas</h2>
            </div>
            <CreditCard size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((method) => (
                <tr key={method.id}>
                  <td className="mono">{method.code}</td>
                  <td>{method.name}<small className="product-detail">{method.note || ""}</small></td>
                  <td><span className="badge blue">{method.type}</span></td>
                  <td><span className={method.active ? "badge green" : "badge gray"}>{method.active ? "Ativa" : "Inativa"}</span></td>
                  <td>
                    <BaseCrudActions
                      endpoint={`/api/cadastros/formas-pagamento/${method.id}`}
                      active={method.active}
                      fields={[
                        { key: "code", label: "Codigo", value: method.code },
                        { key: "name", label: "Nome", value: method.name },
                        { key: "type", label: "Tipo", value: method.type, kind: "select", options: paymentTypes },
                        { key: "note", label: "Observacao", value: method.note || "" }
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {paymentMethods.length === 0 ? <tr><td colSpan={5}>Nenhuma forma cadastrada.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
