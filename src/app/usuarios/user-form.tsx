"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type RoleOption = {
  id: string;
  name: string;
};

type UserFormProps = {
  roles: RoleOption[];
};

export function UserForm({ roles }: UserFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        roleId: formData.get("roleId"),
        department: formData.get("department") || undefined,
        status: formData.get("status") || "ACTIVE"
      })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel criar o usuario.");
      return;
    }

    form.reset();
    setMessage("Usuario criado com sucesso.");
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Nome</span>
        <input className="form-input" name="name" placeholder="Nome do usuario" maxLength={120} required />
      </label>

      <label className="field">
        <span>E-mail</span>
        <input className="form-input mono" name="email" type="email" placeholder="usuario@empresa.com" maxLength={160} required />
      </label>

      <div className="form-two">
        <label className="field">
          <span>Senha inicial</span>
          <input className="form-input" name="password" type="password" minLength={8} placeholder="Minimo 8 caracteres" required />
        </label>
        <label className="field">
          <span>Departamento</span>
          <input className="form-input" name="department" placeholder="Ex.: Escritorio" maxLength={80} />
        </label>
      </div>

      <div className="form-two">
        <label className="field">
          <span>Perfil</span>
          <select className="form-input" name="roleId" required defaultValue="">
            <option value="" disabled>Selecione</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="form-input" name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
          </select>
        </label>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <button className="primary-button" type="submit" disabled={loading}>
        <Save size={17} />
        {loading ? "Salvando..." : "Adicionar usuario"}
      </button>
    </form>
  );
}
