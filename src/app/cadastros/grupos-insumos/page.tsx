import { redirect } from "next/navigation";
import { Boxes, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";
import { InputGroupActions } from "./input-group-actions";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  MATERIA_PRIMA: "Matéria-prima",
  INSUMO: "Insumo",
  FORMA_MOLDE: "Forma/molde",
  SERVICO: "Serviço"
};

export default async function GruposInsumosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cadastros/grupos-insumos");
  }

  if (!session.permissions.includes("cadastros.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [groups, financialGroups, groupedItems] = await Promise.all([
    prisma.inputGroup.findMany({
      include: { defaultFinancialGroup: true },
      orderBy: [{ type: "asc" }, { code: "asc" }]
    }),
    prisma.financialGroup.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { code: "asc" }]
    }),
    prisma.item.groupBy({
      by: ["group"],
      where: {
        group: { not: null }
      },
      _count: { _all: true }
    })
  ]);
  const itemCountByGroupName = new Map(groupedItems.map((itemGroup) => [itemGroup.group || "", itemGroup._count._all]));

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Grupos de insumos</h1>
          <p className="lead">Organize matéria-prima, insumos, serviços e itens de apoio para compras, estoque e ficha técnica.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/grupos-insumos" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo grupo</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/grupos-insumos"
            submitLabel="Salvar grupo"
            successMessage="Grupo de insumos salvo com sucesso."
            formType="inputGroup"
          >
            <div className="form-two">
              <label className="field">
                <span>Código</span>
                <input className="form-input mono" name="code" placeholder="GRP-CIM" required />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select className="form-input" name="type" defaultValue="INSUMO">
                  <option value="MATERIA_PRIMA">Matéria-prima</option>
                  <option value="INSUMO">Insumo</option>
                  <option value="FORMA_MOLDE">Forma/molde</option>
                  <option value="SERVICO">Serviço</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Nome</span>
              <input className="form-input" name="name" placeholder="Cimento, aço, aditivos..." required />
            </label>
            <label className="field">
              <span>Grupo financeiro padrão</span>
              <select className="form-input" name="defaultFinancialGroupId" defaultValue="">
                <option value="">Sem vínculo</option>
                {financialGroups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.code} - {group.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="check-row">
              <label>
                <input name="controlsStock" type="checkbox" defaultChecked />
                Controla estoque
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
              <h2>Grupos de insumos cadastrados</h2>
            </div>
            <Boxes size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Financeiro</th>
                <th>Produtos</th>
                <th>Estoque</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td className="mono">{group.code}</td>
                  <td>{group.name}</td>
                  <td><span className="badge blue">{typeLabels[group.type]}</span></td>
                  <td>{group.defaultFinancialGroup?.name || "-"}</td>
                  <td><span className="badge blue">{itemCountByGroupName.get(group.name) || 0} por nome</span></td>
                  <td><span className={group.controlsStock ? "badge green" : "badge orange"}>{group.controlsStock ? "Controla" : "Não controla"}</span></td>
                  <td><span className={group.active ? "badge green" : "badge red"}>{group.active ? "Ativo" : "Inativo"}</span></td>
                  <td>
                    <InputGroupActions
                      group={{
                        id: group.id,
                        code: group.code,
                        name: group.name,
                        type: group.type,
                        defaultFinancialGroupId: group.defaultFinancialGroupId || "",
                        controlsStock: group.controlsStock,
                        active: group.active,
                        note: group.note || ""
                      }}
                      financialGroups={financialGroups.map((financialGroup) => ({
                        id: financialGroup.id,
                        code: financialGroup.code,
                        name: financialGroup.name
                      }))}
                    />
                  </td>
                </tr>
              ))}
              {groups.length === 0 ? <tr><td colSpan={8}>Nenhum grupo de insumos criado ainda.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
