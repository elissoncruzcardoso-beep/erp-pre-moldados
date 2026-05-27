import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requestedPath = params?.next;
  const nextPath =
    requestedPath && requestedPath.startsWith("/") && requestedPath !== "/login"
      ? requestedPath
      : "/dashboard";

  return (
    <section className="login-shell">
      <div className="login-card accent-blue">
        <div className="login-mark">
          <ShieldCheck size={28} />
          <span>MVP seguro</span>
        </div>
        <p className="eyebrow">Acesso restrito</p>
        <h1>Entrar no ERP de pre-moldados</h1>
        <p className="lead">
          Use o usuario inicial do seed ou um usuario criado no Supabase. As proximas telas reais
          vao respeitar permissao por perfil.
        </p>
        <Suspense>
          <LoginForm nextPath={nextPath} />
        </Suspense>
      </div>
    </section>
  );
}
