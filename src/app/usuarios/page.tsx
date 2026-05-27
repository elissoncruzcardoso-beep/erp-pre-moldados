import { redirect } from "next/navigation";
import { ShieldCheck, UserCog, Users } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { UserActions } from "./user-actions";
import { UserForm } from "./user-form";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/usuarios");
  }

  if (!session.permissions.includes("usuarios.manage")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { role: true },
      orderBy: [{ status: "asc" }, { name: "asc" }]
    }),
    prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Seguranca e acessos</p>
          <h1>Usuarios e perfis do ERP</h1>
          <p className="lead">
            Cadastre usuarios internos, defina perfis de acesso, acompanhe status e mantenha a
            gestao de permissoes dentro do ERP.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Sessao ativa: {session.name}
          </span>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-4">
          <div className="metric-top">
            <span className="mono">Usuarios cadastrados</span>
            <Users size={22} />
          </div>
          <strong className="metric-value">{users.length}</strong>
          <span className="metric-sub">Inclui o administrador inicial criado pelo seed.</span>
        </article>
        <article className="metric-card accent-orange span-4">
          <div className="metric-top">
            <span className="mono">Perfis ativos</span>
            <UserCog size={22} />
          </div>
          <strong className="metric-value">{roles.length}</strong>
          <span className="metric-sub">Administrador, diretoria e areas operacionais.</span>
        </article>
        <article className="metric-card accent-gray span-4">
          <div className="metric-top">
            <span className="mono">Permissoes</span>
            <ShieldCheck size={22} />
          </div>
          <strong className="metric-value">
            {roles.reduce((total, role) => total + role.permissions.length, 0)}
          </strong>
          <span className="metric-sub">Distribuidas entre os perfis do MVP.</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo usuario</p>
          <h2>Adicionar acesso interno</h2>
          <p className="section-note">
            O login nao possui cadastro publico. Novos acessos sao criados aqui por administrador.
          </p>
          <UserForm roles={roles.map((role) => ({ id: role.id, name: role.name }))} />
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Usuarios</p>
              <h2>Contas cadastradas</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Departamento</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {user.id === session.userId ? <small className="product-detail">Usuario atual</small> : null}
                  </td>
                  <td className="mono">{user.email}</td>
                  <td>{user.department || "-"}</td>
                  <td>{user.role.name}</td>
                  <td>
                    <span className={user.status === "ACTIVE" ? "badge green" : "badge red"}>
                      {user.status === "ACTIVE" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <UserActions
                      roles={roles.map((role) => ({ id: role.id, name: role.name }))}
                      user={{
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        department: user.department || "",
                        roleId: user.roleId,
                        status: user.status,
                        isCurrentUser: user.id === session.userId
                      }}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhum usuario cadastrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>

      <section className="grid-12">
        <section className="card accent-blue span-12 users-role-panel">
          <p className="eyebrow">Perfis</p>
          <h2>Matriz de permissao</h2>
          <div className="role-list">
            {roles.map((role) => (
              <article className="role-item" key={role.id}>
                <div className="split-row">
                  <strong>{role.name}</strong>
                  <span className="badge blue">{role.permissions.length} permissoes</span>
                </div>
                <div className="permission-tags">
                  {role.permissions.map(({ permission }) => (
                    <span className="report-chip" key={permission.id}>
                      {permission.key}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
