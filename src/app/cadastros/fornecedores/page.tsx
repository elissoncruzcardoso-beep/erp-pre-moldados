import { ShieldCheck, Truck } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { TABLE_PAGE_LIMIT } from "@/lib/query-limits";
import { BaseCrudActions } from "../_components/base-crud-actions";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const session = await requirePageSession({ nextPath: "/cadastros/fornecedores", permission: "cadastros.manage" });

  const prisma = getPrisma();
  const suppliers = await prisma.supplier.findMany({
    include: {
      _count: {
        select: {
          quotes: true,
          orders: true,
          accountsPayable: true
        }
      }
    },
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: TABLE_PAGE_LIMIT
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Fornecedores</h1>
          <p className="lead">Base para cotações, pedidos de compra, recebimentos, notas fiscais e contas a pagar.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/fornecedores" />

      <section className="grid-12">
        <section className="card accent-orange span-4">
          <p className="eyebrow">Novo fornecedor</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/fornecedores"
            submitLabel="Salvar fornecedor"
            successMessage="Fornecedor salvo com sucesso."
            formType="supplier"
          >
            <div className="form-two">
              <label className="field">
                <span>Codigo</span>
                <input className="form-input mono" name="code" placeholder="FOR-001" maxLength={30} required />
              </label>
              <label className="field">
                <span>CPF/CNPJ</span>
                <input className="form-input mono" name="document" placeholder="Opcional" maxLength={40} />
              </label>
            </div>
            <label className="field">
              <span>Nome/Razao social</span>
              <input className="form-input" name="name" placeholder="Nome do fornecedor" maxLength={120} required />
            </label>
            <div className="form-two">
              <label className="field">
                <span>E-mail</span>
                <input className="form-input" name="email" type="email" placeholder="fornecedor@email.com" maxLength={120} />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input className="form-input" name="phone" placeholder="(00) 00000-0000" maxLength={40} />
              </label>
            </div>
          </BaseRegisterForm>
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lista</p>
              <h2>Fornecedores cadastrados</h2>
            </div>
            <Truck size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Fornecedor</th>
                <th>Documento</th>
                <th>Contato</th>
                <th>Vinculos</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="mono">{supplier.code}</td>
                  <td><strong>{supplier.name}</strong></td>
                  <td className="mono">{supplier.document || "-"}</td>
                  <td>
                    {supplier.phone || "-"}
                    <small className="product-detail">{supplier.email || ""}</small>
                  </td>
                  <td>
                    <span className="daily-item-pill">{supplier._count.quotes} cot.</span>
                    <span className="daily-item-pill">{supplier._count.orders} ped.</span>
                    <span className="daily-item-pill">{supplier._count.accountsPayable} fin.</span>
                  </td>
                  <td><span className={supplier.active ? "badge green" : "badge gray"}>{supplier.active ? "Ativo" : "Inativo"}</span></td>
                  <td>
                    <BaseCrudActions
                      endpoint={`/api/cadastros/fornecedores/${supplier.id}`}
                      active={supplier.active}
                      fields={[
                        { key: "code", label: "Codigo", value: supplier.code },
                        { key: "name", label: "Nome/Razao social", value: supplier.name },
                        { key: "document", label: "CPF/CNPJ", value: supplier.document || "" },
                        { key: "email", label: "E-mail", value: supplier.email || "" },
                        { key: "phone", label: "Telefone", value: supplier.phone || "" }
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 ? (
                <tr><td colSpan={7}>Nenhum fornecedor cadastrado.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
