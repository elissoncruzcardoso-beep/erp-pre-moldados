import { redirect } from "next/navigation";
import { Calculator, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída"
};

export default async function GruposFinanceirosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cadastros/grupos-financeiros");
  }

  if (!session.permissions.includes("cadastros.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const groups = await prisma.financialGroup.findMany({
    include: { _count: { select: { inputGroups: true } } },
    orderBy: [{ type: "asc" }, { code: "asc" }]
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Grupos financeiros</h1>
          <p className="lead">Classifique entradas e saídas para contas, fluxo de caixa e relatórios gerenciais.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/grupos-financeiros" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo grupo</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/grupos-financeiros"
            submitLabel="Salvar grupo"
            successMessage="Grupo financeiro salvo com sucesso."
            formType="financialGroup"
          >
            <div className="form-two">
              <label className="field">
                <span>Código</span>
                <input className="form-input mono" name="code" placeholder="FIN-MP" required />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select className="form-input" name="type" defaultValue="SAIDA">
                  <option value="SAIDA">Saída</option>
                  <option value="ENTRADA">Entrada</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Nome</span>
              <input className="form-input" name="name" placeholder="Compra de matéria-prima" required />
            </label>
            <div className="form-two">
              <label className="field">
                <span>Categoria</span>
                <input className="form-input" name="category" placeholder="Produção, administrativo..." />
              </label>
              <label className="field">
                <span>Centro de custo</span>
                <input className="form-input" name="costCenter" placeholder="Fábrica, obra..." />
              </label>
            </div>
            <label className="field">
              <span>Observação</span>
              <textarea className="form-input production-textarea" name="note" maxLength={300} />
            </label>
          </BaseRegisterForm>
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lista</p>
              <h2>Grupos financeiros cadastrados</h2>
            </div>
            <Calculator size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Centro custo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td className="mono">{group.code}</td>
                  <td>{group.name}</td>
                  <td><span className={group.type === "ENTRADA" ? "badge green" : "badge orange"}>{typeLabels[group.type]}</span></td>
                  <td>{group.category || "-"}</td>
                  <td>{group.costCenter || "-"}</td>
                  <td><span className={group.active ? "badge green" : "badge red"}>{group.active ? "Ativo" : "Inativo"}</span></td>
                </tr>
              ))}
              {groups.length === 0 ? <tr><td colSpan={6}>Nenhum grupo financeiro criado ainda.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
