"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, Save, Trash2, X } from "lucide-react";

type PermissionOption = {
  id: string;
  key: string;
  module: string;
  description: string;
};

type RoleRecord = {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: PermissionOption[];
};

type RoleManagementProps = {
  roles: RoleRecord[];
  permissions: PermissionOption[];
};

type RoleModalState = {
  role: RoleRecord;
} | null;

function groupPermissions(permissions: PermissionOption[]) {
  return permissions.reduce<Record<string, PermissionOption[]>>((groups, permission) => {
    groups[permission.module] = groups[permission.module] || [];
    groups[permission.module].push(permission);
    return groups;
  }, {});
}

function PermissionChecklist({
  permissions,
  selectedIds
}: {
  permissions: PermissionOption[];
  selectedIds?: Set<string>;
}) {
  const grouped = useMemo(() => groupPermissions(permissions), [permissions]);

  return (
    <div className="permission-checklist">
      {Object.entries(grouped).map(([moduleName, modulePermissions]) => (
        <fieldset className="permission-group" key={moduleName}>
          <legend>{moduleName}</legend>
          {modulePermissions.map((permission) => (
            <label className="permission-check" key={permission.id}>
              <input
                type="checkbox"
                name="permissionIds"
                value={permission.id}
                defaultChecked={selectedIds?.has(permission.id)}
              />
              <span>
                <strong>{permission.key}</strong>
                <small>{permission.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export function RoleManagement({ roles, permissions }: RoleManagementProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RoleModalState>(null);
  const sortedPermissions = useMemo(
    () => [...permissions].sort((left, right) => left.module.localeCompare(right.module) || left.key.localeCompare(right.key)),
    [permissions]
  );

  function buildPayload(form: HTMLFormElement) {
    const formData = new FormData(form);
    return {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      permissionIds: formData.getAll("permissionIds").map(String)
    };
  }

  async function submitRole(endpoint: string, method: "POST" | "PUT", form: HTMLFormElement) {
    setError("");
    setMessage("");
    setLoading(true);
    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(form))
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Não foi possível salvar o perfil.");
      return false;
    }

    form.reset();
    setEditing(null);
    setMessage(method === "POST" ? "Perfil criado com sucesso." : "Perfil atualizado com sucesso.");
    router.refresh();
    return true;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitRole("/api/usuarios/perfis", "POST", event.currentTarget);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    await submitRole(`/api/usuarios/perfis/${editing.role.id}`, "PUT", event.currentTarget);
  }

  async function deleteRole(role: RoleRecord) {
    if (role.userCount > 0) {
      window.alert("Não é possível excluir perfil vinculado a usuários.");
      return;
    }

    const confirmed = window.confirm(`Excluir o perfil ${role.name}?`);
    if (!confirmed) return;

    const response = await fetch(`/api/usuarios/perfis/${role.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Não foi possível excluir o perfil.");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <section className="card accent-blue role-create-card">
        <p className="eyebrow">Novo perfil</p>
        <h3>Criar perfil de acesso</h3>
        <form className="product-form" onSubmit={handleCreate}>
          <div className="form-two">
            <label className="field">
              <span>Nome do perfil</span>
              <input className="form-input" name="name" placeholder="Ex.: Comercial" maxLength={80} required />
            </label>
            <label className="field">
              <span>Descrição</span>
              <input className="form-input" name="description" placeholder="Resumo do acesso" maxLength={180} />
            </label>
          </div>
          <PermissionChecklist permissions={sortedPermissions} />
          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-success">{message}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            <Plus size={16} />
            {loading ? "Salvando..." : "Criar perfil"}
          </button>
        </form>
      </section>

      <div className="role-list">
        {roles.map((role) => (
          <article className="role-item" key={role.id}>
            <div className="split-row">
              <div>
                <strong>{role.name}</strong>
                {role.description ? <small className="product-detail">{role.description}</small> : null}
              </div>
              <div className="button-row compact-actions">
                <span className="badge blue">{role.permissions.length} permissões</span>
                <span className="badge">{role.userCount} usuário(s)</span>
                <button className="icon-button" type="button" onClick={() => setEditing({ role })} title="Editar perfil">
                  <Edit3 size={16} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => deleteRole(role)}
                  disabled={role.name === "Administrador" || role.userCount > 0}
                  title="Excluir perfil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="permission-tags">
              {role.permissions.map((permission) => (
                <span className="report-chip" key={permission.id}>
                  <strong>{permission.module}</strong>
                  {permission.key}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {editing ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="controlled-cancel-modal user-edit-modal role-edit-modal">
            <header>
              <div>
                <p className="eyebrow">Editar perfil</p>
                <h2>{editing.role.name}</h2>
                <span>{editing.role.userCount} usuário(s) vinculado(s)</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(null)} title="Fechar">
                <X size={18} />
              </button>
            </header>
            <form className="product-form" onSubmit={handleEdit}>
              <div className="form-two">
                <label className="field">
                  <span>Nome do perfil</span>
                  <input className="form-input" name="name" defaultValue={editing.role.name} maxLength={80} required />
                </label>
                <label className="field">
                  <span>Descrição</span>
                  <input className="form-input" name="description" defaultValue={editing.role.description} maxLength={180} />
                </label>
              </div>
              <PermissionChecklist
                permissions={sortedPermissions}
                selectedIds={new Set(editing.role.permissions.map((permission) => permission.id))}
              />
              {error ? <p className="auth-error">{error}</p> : null}
              <footer>
                <button className="secondary-button" type="button" onClick={() => setEditing(null)} disabled={loading}>
                  <X size={16} />
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={loading}>
                  <Save size={16} />
                  {loading ? "Salvando..." : "Salvar perfil"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
