import Link from "next/link";

type FinanceModuleTabsProps = {
  active: "resumo" | "receber" | "pagar";
};

export function FinanceModuleTabs({ active }: FinanceModuleTabsProps) {
  return (
    <nav className="module-tabs finance-module-tabs" aria-label="Navegacao financeiro">
      <Link className={`module-tab ${active === "resumo" ? "active" : ""}`} href="/financeiro">
        Resumo
      </Link>
      <Link className={`module-tab ${active === "receber" ? "active" : ""}`} href="/financeiro/contas-receber">
        Contas a receber
      </Link>
      <Link className={`module-tab ${active === "pagar" ? "active" : ""}`} href="/financeiro/contas-pagar">
        Contas a pagar
      </Link>
    </nav>
  );
}
