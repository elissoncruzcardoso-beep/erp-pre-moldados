"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileBarChart, FileText, ReceiptText, ShoppingCart } from "lucide-react";

const tabs = [
  { href: "/suprimentos/solicitacoes", label: "Solicitacoes", icon: ClipboardList },
  { href: "/suprimentos/cotacoes", label: "Cotacoes", icon: ShoppingCart },
  { href: "/suprimentos/pedidos", label: "Pedidos", icon: FileText },
  { href: "/suprimentos/notas-fiscais", label: "Notas fiscais de compra", icon: ReceiptText },
  { href: "/suprimentos/relatorios", label: "Relatorios", icon: FileBarChart }
];

export function SuprimentosNav() {
  const pathname = usePathname();

  return (
    <nav className="module-tabs" aria-label="Navegacao de suprimentos">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href;

        return (
          <Link className={active ? "module-tab active" : "module-tab"} href={tab.href} key={tab.href}>
            <Icon size={16} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
