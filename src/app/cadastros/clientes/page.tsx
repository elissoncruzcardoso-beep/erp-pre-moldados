import { ShieldCheck, Users } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { TABLE_PAGE_LIMIT } from "@/lib/query-limits";
import { BaseCrudActions } from "../_components/base-crud-actions";
import { BaseRegisterForm } from "../_components/base-register-form";
import { CadastrosNav } from "../_components/cadastros-nav";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const session = await requirePageSession({ nextPath: "/cadastros/clientes", permission: "cadastros.manage" });

  const prisma = getPrisma();
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { accountsReceivable: true, orders: true } }
    },
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: TABLE_PAGE_LIMIT
  });

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Cadastros base</p>
          <h1>Clientes</h1>
          <p className="lead">Base para venda direta, recibos, contas a receber e pedidos futuros.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={16} /> {session.role}</span>
        </div>
      </section>

      <CadastrosNav active="/cadastros/clientes" />

      <section className="grid-12">
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo cliente</p>
          <h2>Criar ou atualizar</h2>
          <BaseRegisterForm
            endpoint="/api/cadastros/clientes"
            submitLabel="Salvar cliente"
            successMessage="Cliente salvo com sucesso."
            formType="customer"
          >
            <div className="form-two">
              <label className="field">
                <span>Codigo</span>
                <input className="form-input mono" name="code" placeholder="CLI-001" maxLength={30} required />
              </label>
              <label className="field">
                <span>CPF/CNPJ</span>
                <input className="form-input mono" name="document" placeholder="Opcional" maxLength={40} />
              </label>
            </div>
            <label className="field">
              <span>Nome/Razao social</span>
              <input className="form-input" name="name" placeholder="Nome do cliente" maxLength={120} required />
            </label>
            <div className="form-two">
              <label className="field">
                <span>E-mail</span>
                <input className="form-input" name="email" type="email" placeholder="cliente@email.com" maxLength={120} />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input className="form-input" name="phone" placeholder="(00) 00000-0000" maxLength={40} />
              </label>
            </div>
            <label className="field">
              <span>Endereco</span>
              <input className="form-input" name="address" placeholder="Rua, numero, bairro" maxLength={160} />
            </label>
            <div className="form-two">
              <label className="field">
                <span>Cidade</span>
                <input className="form-input" name="city" maxLength={80} />
              </label>
              <label className="field">
                <span>UF</span>
                <input className="form-input mono" name="state" maxLength={2} />
              </label>
            </div>
          </BaseRegisterForm>
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Lista</p>
              <h2>Clientes cadastrados</h2>
            </div>
            <Users size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Contato</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="mono">{customer.code}</td>
                  <td>
                    <strong>{customer.name}</strong>
                    <small className="product-detail">{customer.city || "-"} {customer.state || ""}</small>
                  </td>
                  <td className="mono">{customer.document || "-"}</td>
                  <td>
                    {customer.phone || "-"}
                    <small className="product-detail">{customer.email || ""}</small>
                  </td>
                  <td><span className={customer.active ? "badge green" : "badge gray"}>{customer.active ? "Ativo" : "Inativo"}</span></td>
                  <td>
                    <BaseCrudActions
                      endpoint={`/api/cadastros/clientes/${customer.id}`}
                      active={customer.active}
                      fields={[
                        { key: "code", label: "Codigo", value: customer.code },
                        { key: "name", label: "Nome/Razao social", value: customer.name },
                        { key: "document", label: "CPF/CNPJ", value: customer.document || "" },
                        { key: "email", label: "E-mail", value: customer.email || "" },
                        { key: "phone", label: "Telefone", value: customer.phone || "" },
                        { key: "address", label: "Endereco", value: customer.address || "" },
                        { key: "city", label: "Cidade", value: customer.city || "" },
                        { key: "state", label: "UF", value: customer.state || "" }
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr><td colSpan={6}>Nenhum cliente cadastrado.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
