"use client";

import { useRouter } from "next/navigation";
import { Edit3, KeyRound, Power } from "lucide-react";

type RoleOption = {
  id: string;
  name: string;
};

type UserActionProps = {
  user: {
    id: string;
    name: string;
    email: string;
    department: string;
    roleId: string;
    status: "ACTIVE" | "INACTIVE";
    isCurrentUser: boolean;
  };
  roles: RoleOption[];
};

export function UserActions({ user, roles }: UserActionProps) {
  const router = useRouter();

  async function submitUpdate(payload: Record<string, string>) {
    const response = await fetch(`/api/usuarios/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel atualizar o usuario.");
      return;
    }

    router.refresh();
  }

  async function editUser() {
    const name = window.prompt("Nome", user.name);
    if (name === null) return;

    const email = window.prompt("E-mail", user.email);
    if (email === null) return;

    const department = window.prompt("Departamento", user.department);
    if (department === null) return;

    const roleList = roles.map((role) => `${role.id} = ${role.name}`).join("\n");
    const roleId = window.prompt(`Perfil\n${roleList}`, user.roleId);
    if (roleId === null) return;

    const status = window.prompt("Status: ACTIVE ou INACTIVE", user.status);
    if (status === null) return;

    await submitUpdate({
      name,
      email,
      department,
      roleId,
      status,
      password: ""
    });
  }

  async function resetPassword() {
    const password = window.prompt("Nova senha inicial para este usuario. Minimo 8 caracteres.");
    if (password === null) return;

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
      window.alert("Voce nao pode inativar seu proprio usuario.");
      return;
    }

    const confirmed = window.confirm(user.status === "ACTIVE" ? "Inativar este usuario?" : "Reativar este usuario?");
    if (!confirmed) return;

    const response = await fetch(`/api/usuarios/${user.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel alterar o status do usuario.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <button className="icon-button" type="button" onClick={editUser} title="Editar usuario">
        <Edit3 size={16} />
      </button>
      <button className="icon-button" type="button" onClick={resetPassword} title="Redefinir senha">
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
  );
}
