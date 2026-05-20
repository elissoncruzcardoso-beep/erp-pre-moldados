"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, UserCog } from "lucide-react";

type CurrentUser = {
  name: string;
  email: string;
  role: string;
} | null;

export function AuthMenu() {
  const [user, setUser] = useState<CurrentUser>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }

  if (!user) {
    return (
      <Link className="top-link" href="/login" aria-label="Entrar">
        <LogIn size={16} />
        <span>Login</span>
      </Link>
    );
  }

  return (
    <div className="auth-menu">
      <Link className="top-link" href="/usuarios" aria-label="Usuarios">
        <UserCog size={16} />
        <span>{user.role}</span>
      </Link>
      <button className="top-link" type="button" onClick={logout} aria-label="Sair">
        <LogOut size={16} />
        <span>Sair</span>
      </button>
    </div>
  );
}
