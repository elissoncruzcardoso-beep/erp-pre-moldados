import { redirect } from "next/navigation";
import { HandCoins, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { BaseCrudActions } from "../_components/base-crud-actions";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";

export const dynamic = "force-dynamic";

const directions = [
  { value: "ENTRADA", label: "Entrada/recebimento" },
  { value: "SAIDA", label: "Saida/pagamento" },
  { value: "ESTORNO", label: "Estorno/ajuste" }
];

export default async function TiposBaixaPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cadastros/tipos-baixa");
  }

  if (!session.permissions.includes("cadastros.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const settlementTypes = await prisma.financialSettlementType.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }]
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros financeiros</p>
          <h1>Tipos de baixas financeiras</h1>
          <p className="lead">Classifique recebimentos, pagamentos, descontos, juros, estornos e ajustes financeiros.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/tipos-baixa" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo tipo</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/tipos-baixa"
            submitLabel="Salvar tipo"
            successMessage="Tipo de baixa salvo com sucesso."
            formType="settlementType"
          >
            <label className="field">
              <span>Codigo</span>
              <input className="form-input mono" name="code" placeholder="REC-PIX, PAG-BOLETO" maxLength={30} required />
            </label>
            <label className="field">
              <span>Nome</span>
              <input className="form-input" name="name" placeholder="Recebimento via Pix" maxLength={90} required />
            </label>
            <label className="field">
              <span>Direcao</span>
              <select className="form-input" name="direction" defaultValue="ENTRADA">
                {directions.map((direction) => <option value={direction.value} key={direction.value}>{direction.label}</option>)}
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
              <h2>Tipos cadastrados</h2>
            </div>
            <HandCoins size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nome</th>
                <th>Direcao</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {settlementTypes.map((type) => (
                <tr key={type.id}>
                  <td className="mono">{type.code}</td>
                  <td>{type.name}<small className="product-detail">{type.note || ""}</small></td>
                  <td><span className="badge blue">{type.direction}</span></td>
                  <td><span className={type.active ? "badge green" : "badge gray"}>{type.active ? "Ativo" : "Inativo"}</span></td>
                  <td>
                    <BaseCrudActions
                      endpoint={`/api/cadastros/tipos-baixa/${type.id}`}
                      active={type.active}
                      fields={[
                        { key: "code", label: "Codigo", value: type.code },
                        { key: "name", label: "Nome", value: type.name },
                        { key: "direction", label: "Direcao", value: type.direction, kind: "select", options: directions },
                        { key: "note", label: "Observacao", value: type.note || "" }
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {settlementTypes.length === 0 ? <tr><td colSpan={5}>Nenhum tipo cadastrado.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
