import { KeyRound } from "lucide-react";
import { SetupAdminForm } from "./setup-admin-form";

export default function SetupAdminPage() {
  return (
    <section className="login-shell">
      <div className="login-card accent-orange">
        <div className="login-mark">
          <KeyRound size={28} />
          <span>Configuracao inicial</span>
        </div>
        <p className="eyebrow">Primeiro acesso</p>
        <h1>Escolher senha do administrador</h1>
        <p className="lead">
          Defina ou redefina a senha do usuario administrador criado no seed. Use esta tela no
          ambiente de desenvolvimento quando esquecer a senha inicial.
        </p>
        <SetupAdminForm />
      </div>
    </section>
  );
}
