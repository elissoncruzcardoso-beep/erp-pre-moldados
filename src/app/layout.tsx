import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  Gauge,
  Menu,
  PackageSearch,
  Search,
  Settings2,
  ShieldCheck,
  UserCog,
  WalletCards
} from "lucide-react";
import { AuthMenu } from "@/components/auth-menu";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Pré-Moldados",
  description: "Protótipo visual industrial para gestão de pré-moldados."
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/produtos", label: "Produtos", icon: ClipboardList },
  { href: "/producao", label: "Produção", icon: Factory },
  { href: "/suprimentos", label: "Suprimentos", icon: PackageSearch },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards },
  { href: "/cadastros", label: "Cadastros", icon: Settings2 },
  { href: "/usuarios", label: "Usuários", icon: UserCog }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <Building2 size={28} strokeWidth={2.4} />
              <div>
                <strong>PRECAST ERP</strong>
                <span>Controle estrutural</span>
              </div>
            </div>

            <nav className="nav-list" aria-label="Navegação principal">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="nav-item">
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="sidebar-panel">
              <ShieldCheck size={18} />
              <div>
                <strong>MVP seguro</strong>
                <span>Perfis, auditoria e rastreabilidade planejados desde a base.</span>
              </div>
            </div>
          </aside>

          <div className="main-zone">
            <header className="topbar">
              <button className="icon-button" aria-label="Abrir menu">
                <Menu size={21} />
              </button>
              <div className="search-box">
                <Search size={18} />
                <span>Buscar ordem, lote, peça ou fornecedor</span>
              </div>
              <div className="top-actions">
                <div className="status-pill">
                  <Activity size={16} />
                  Turno A em operação
                </div>
                <AuthMenu />
                <div className="avatar" aria-label="Usuário">EP</div>
              </div>
            </header>

            <main className="content">{children}</main>

            <nav className="mobile-nav" aria-label="Navegação mobile">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </body>
    </html>
  );
}
