"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, KeyRound, Power, Save, X } from "lucide-react";

type RoleOption = {
  id: string;
  name: string;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  department: string;
  roleId: string;
  status: "ACTIVE" | "INACTIVE";
  isCurrentUser: boolean;
};

type UserActionProps = {
  user: ManagedUser;
  roles: RoleOption[];
};

type UserModalMode = "edit" | "password" | null;

export function UserActions({ user, roles }: UserActionProps) {
  const router = useRouter();
  const [mode, setMode] = useState<UserModalMode>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitUpdate(payload: Record<string, string>) {
    setError("");
    setLoading(true);
    const response = await fetch(`/api/usuarios/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Não foi possível atualizar o usuário.");
      return false;
    }

    setMode(null);
    router.refresh();
    return true;
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitUpdate({
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      department: String(formData.get("department") || ""),
      roleId: String(formData.get("roleId") || ""),
      status: String(formData.get("status") || user.status),
      password: ""
    });
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");

    if (password.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    await submitUpdate({
      name: user.name,
      email: user.email,
      department: user.department,
      roleId: user.roleId,
      status: user.status,
      password
    });
  }

  async function toggleStatus() {
    if (user.isCurrentUser) {
      window.alert("Você não pode inativar seu próprio usuário.");
      return;
    }

    const confirmed = window.confirm(user.status === "ACTIVE" ? "Inativar este usuário?" : "Reativar este usuário?");
    if (!confirmed) return;

    const response = await fetch(`/api/usuarios/${user.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Não foi possível alterar o status do usuário.");
      return;
    }

    router.refresh();
  }

  function closeModal() {
    if (loading) return;
    setError("");
    setMode(null);
  }

  return (
    <>
      <div className="quote-action-cell">
        <button className="icon-button" type="button" onClick={() => setMode("edit")} title="Editar usuário">
          <Edit3 size={16} />
        </button>
        <button className="icon-button" type="button" onClick={() => setMode("password")} title="Redefinir senha">
          <KeyRound size={16} />
        </button>
        <button
          className={user.status === "ACTIVE" ? "icon-button danger" : "icon-button"}
          type="button"
          onClick={toggleStatus}
          title={user.status === "ACTIVE" ? "Inativar" : "Reativar"}
          disabled={user.isCurrentUser}
        >
          <Power size={16} />
        </button>
      </div>

      {mode ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="controlled-cancel-modal user-edit-modal">
            <header>
              <div>
                <p className="eyebrow">{mode === "edit" ? "Editar usuário" : "Redefinir senha"}</p>
                <h2>{user.name}</h2>
                <span>{user.email}</span>
              </div>
              <button className="icon-button" type="button" onClick={closeModal} title="Fechar">
                <X size={18} />
              </button>
            </header>

            {mode === "edit" ? (
              <form className="product-form" onSubmit={handleEdit}>
                <div className="form-two">
                  <label className="field">
                    <span>Nome</span>
                    <input className="form-input" name="name" defaultValue={user.name} maxLength={120} required />
                  </label>
                  <label className="field">
                    <span>E-mail</span>
                    <input className="form-input mono" name="email" type="email" defaultValue={user.email} maxLength={160} required />
                  </label>
                </div>
                <div className="form-two">
                  <label className="field">
                    <span>Departamento</span>
                    <input className="form-input" name="department" defaultValue={user.department} maxLength={80} />
                  </label>
                  <label className="field">
                    <span>Perfil</span>
                    <select className="form-input" name="roleId" defaultValue={user.roleId} required>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Status</span>
                  <select className="form-input" name="status" defaultValue={user.status} disabled={user.isCurrentUser}>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </label>
                {user.isCurrentUser ? <p className="metric-sub">O usuário atual não pode ser inativado.</p> : null}
                {error ? <p className="auth-error">{error}</p> : null}
                <footer>
                  <button className="secondary-button" type="button" onClick={closeModal} disabled={loading}>
                    <X size={16} />
                    Cancelar
                  </button>
                  <button className="primary-button" type="submit" disabled={loading}>
                    <Save size={16} />
                    {loading ? "Salvando..." : "Salvar usuário"}
                  </button>
                </footer>
              </form>
            ) : (
              <form className="product-form" onSubmit={handlePassword}>
                <label className="field">
                  <span>Nova senha</span>
                  <input
                    className="form-input"
                    name="password"
                    type="password"
                    minLength={8}
                    maxLength={120}
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </label>
                <p className="metric-sub">Use essa opção quando o usuário esquecer a senha ou precisar de senha inicial nova.</p>
                {error ? <p className="auth-error">{error}</p> : null}
                <footer>
                  <button className="secondary-button" type="button" onClick={closeModal} disabled={loading}>
                    <X size={16} />
                    Cancelar
                  </button>
                  <button className="primary-button" type="submit" disabled={loading}>
                    <KeyRound size={16} />
                    {loading ? "Salvando..." : "Atualizar senha"}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
