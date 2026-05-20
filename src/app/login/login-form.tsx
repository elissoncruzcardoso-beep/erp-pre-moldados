"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const [email, setEmail] = useState("admin@erp.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));

    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel entrar. Confira o e-mail e a senha.");
      return;
    }

    window.location.assign(nextPath);
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>E-mail</span>
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
        <span>Senha</span>
        <input
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={loading}>
        <LogIn size={17} />
        {loading ? "Entrando..." : "Entrar no ERP"}
      </button>
    </form>
  );
}
