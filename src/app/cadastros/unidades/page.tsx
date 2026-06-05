import { redirect } from "next/navigation";
import { Ruler, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";
import { UnitActions } from "./unit-actions";

export const dynamic = "force-dynamic";

export default async function UnidadesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/cadastros/unidades");
  }

  if (!session.permissions.includes("cadastros.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const units = await prisma.unitOfMeasure.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { code: "asc" }
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Unidades de medida</h1>
          <p className="lead">Controle UN, KG, M3, L e outras unidades usadas em produtos, compras e estoque.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/unidades" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Nova unidade</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/unidades"
            submitLabel="Salvar unidade"
            successMessage="Unidade salva com sucesso."
            formType="unit"
          >
            <label className="field">
              <span>Código</span>
              <input className="form-input mono" name="code" placeholder="UN, KG, M3" maxLength={30} required />
            </label>
            <label className="field">
              <span>Nome</span>
              <input className="form-input" name="name" placeholder="Unidade, Quilograma..." maxLength={80} required />
            </label>
            <label className="field">
              <span>Casas decimais</span>
              <input className="form-input mono" name="decimals" type="number" min="0" max="6" defaultValue="2" required />
            </label>
          </BaseRegisterForm>
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lista</p>
              <h2>Unidades cadastradas</h2>
            </div>
            <Ruler size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Decimais</th>
                <th>Itens usando</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td className="mono">{unit.code}</td>
                  <td>{unit.name}</td>
                  <td className="mono">{unit.decimals}</td>
                  <td><span className="badge blue">{unit._count.items} itens</span></td>
                  <td>
                    <UnitActions
                      unit={{
                        id: unit.id,
                        code: unit.code,
                        name: unit.name,
                        decimals: unit.decimals,
                        itemsCount: unit._count.items
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
