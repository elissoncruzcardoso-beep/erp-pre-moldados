"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { KeyRound, LogIn } from "lucide-react";

export function SetupAdminForm() {
  const [email, setEmail] = useState("admin@erp.local");
  const [setupSecret, setSetupSecret] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("As senhas digitadas nao conferem.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/setup/admin-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-setup-secret": setupSecret
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel definir a senha inicial.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSetupSecret("");
    setMessage(data.reset ? "Senha redefinida. Agora voce ja pode entrar no ERP." : "Senha inicial definida. Agora voce ja pode entrar no ERP.");
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>E-mail do administrador</span>
        <input
          className="form-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>

      <label className="field">
        <span>Nova senha</span>
        <input
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>

      <label className="field">
        <span>Segredo de setup</span>
        <input
          className="form-input"
          type="password"
          value={setupSecret}
          onChange={(event) => setSetupSecret(event.target.value)}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span>Confirmar senha</span>
        <input
          className="form-input"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}

      <div className="button-row">
        <button className="primary-button" type="submit" disabled={loading}>
          <KeyRound size={17} />
          {loading ? "Salvando..." : "Definir senha"}
        </button>
        <Link className="secondary-button" href="/login">
          <LogIn size={17} />
          Ir para login
        </Link>
      </div>
    </form>
  );
}
