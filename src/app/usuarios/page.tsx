import { ShieldCheck, UserCog, Users } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { FORM_OPTION_LIMIT, RECENT_RECORD_LIMIT, TABLE_PAGE_LIMIT } from "@/lib/query-limits";
import { RoleManagement } from "./role-management";
import { UserActions } from "./user-actions";
import { UserForm } from "./user-form";

export const dynamic = "force-dynamic";

function formatAuditDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default async function UsuariosPage() {
  const session = await requirePageSession({ nextPath: "/usuarios", permission: "usuarios.manage" });

  const prisma = getPrisma();
  const [users, userCount, activeUserCount, roles, permissions, auditLogs] = await Promise.all([
    prisma.user.findMany({
      include: { role: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: TABLE_PAGE_LIMIT
    }),
    prisma.user.count(),
    prisma.user.count({
      where: { status: "ACTIVE" }
    }),
    prisma.role.findMany({
      include: {
        _count: { select: { users: true } },
        permissions: { include: { permission: true } }
      },
      orderBy: { name: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { key: "asc" }],
      take: FORM_OPTION_LIMIT
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { module: "Usuarios" },
          { entity: "User" },
          { action: "LOGIN" }
        ]
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_RECORD_LIMIT
    })
  ]);
  const activeUsers = activeUserCount;
  const inactiveUsers = userCount - activeUsers;
  const roleOptions = roles.map((role) => ({ id: role.id, name: role.name }));
  const roleRecords = roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description || "",
    userCount: role._count.users,
    permissions: role.permissions
      .map(({ permission }) => ({
        id: permission.id,
        key: permission.key,
        module: permission.module,
        description: permission.description
      }))
      .sort((left, right) => left.module.localeCompare(right.module) || left.key.localeCompare(right.key))
  }));
  const permissionOptions = permissions.map((permission) => ({
    id: permission.id,
    key: permission.key,
    module: permission.module,
    description: permission.description
  }));

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Segurança e acessos</p>
          <h1>Usuários e perfis do ERP</h1>
          <p className="lead">
            Cadastre usuários internos, defina perfis de acesso, acompanhe status e mantenha a
            gestão de permissões dentro do ERP.
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
            <span className="mono">Usuários cadastrados</span>
            <Users size={22} />
          </div>
          <strong className="metric-value">{userCount}</strong>
          <span className="metric-sub">{activeUsers} ativo(s) e {inactiveUsers} inativo(s).</span>
        </article>
        <article className="metric-card accent-orange span-4">
          <div className="metric-top">
            <span className="mono">Perfis ativos</span>
            <UserCog size={22} />
          </div>
          <strong className="metric-value">{roles.length}</strong>
          <span className="metric-sub">Administrador, diretoria e áreas operacionais.</span>
        </article>
        <article className="metric-card accent-gray span-4">
          <div className="metric-top">
            <span className="mono">Permissões</span>
            <ShieldCheck size={22} />
          </div>
          <strong className="metric-value">
            {roles.reduce((total, role) => total + role.permissions.length, 0)}
          </strong>
          <span className="metric-sub">Distribuídas entre os perfis do MVP.</span>
        </article>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <section className="card accent-blue span-4">
          <p className="eyebrow">Novo usuário</p>
          <h2>Adicionar acesso interno</h2>
          <p className="section-note">
            O login não possui cadastro público. Novos acessos são criados aqui por administrador.
          </p>
          <UserForm roles={roleOptions} />
        </section>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Usuários</p>
              <h2>Contas cadastradas</h2>
              <p className="metric-sub">Edite dados, perfil, status ou redefina senha pelos botões de ação.</p>
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
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {user.id === session.userId ? <small className="product-detail">Usuário atual</small> : null}
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
                      roles={roleOptions}
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
                  <td colSpan={6}>Nenhum usuário cadastrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>

      <section className="grid-12">
        <section className="card accent-blue span-12 users-role-panel">
          <p className="eyebrow">Perfis</p>
          <h2>Matriz de permissão</h2>
          <p className="section-note">
            Crie perfis por função e marque as permissões que cada equipe pode usar no ERP.
          </p>
          <RoleManagement roles={roleRecords} permissions={permissionOptions} />
        </section>
      </section>

      <section className="grid-12" style={{ marginTop: 16 }}>
        <section className="table-shell span-12">
          <div className="table-header">
            <div>
              <p className="eyebrow">Auditoria</p>
              <h2>Histórico recente de acessos</h2>
              <p className="metric-sub">Eventos de login, criação, edição e inativação de usuários.</p>
            </div>
            <span className="badge blue">{auditLogs.length} eventos</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Ação</th>
                <th>Usuário operador</th>
                <th>Entidade</th>
                <th>Motivo / detalhe</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="mono">{formatAuditDate(log.createdAt)}</td>
                  <td><span className="badge blue">{log.action}</span></td>
                  <td>{log.user?.name || "Sistema"}</td>
                  <td className="mono">{log.entity}{log.entityId ? ` / ${log.entityId.slice(0, 8)}` : ""}</td>
                  <td>{log.justification || log.module}</td>
                </tr>
              ))}
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5}>Nenhum evento de usuário registrado ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
