import Link from "next/link";
import { Boxes, Calculator, ClipboardList, Ruler } from "lucide-react";

const items = [
  { href: "/cadastros/produtos", label: "Produtos", icon: ClipboardList },
  { href: "/cadastros/unidades", label: "Unidades", icon: Ruler },
  { href: "/cadastros/grupos-insumos", label: "Grupos de insumos", icon: Boxes },
  { href: "/cadastros/grupos-financeiros", label: "Grupos financeiros", icon: Calculator }
];

export function CadastrosNav({ active }: { active?: string }) {
  return (
    <nav className="module-tabs" aria-label="Navegação de cadastros">
      {items.map((item) => (
        <Link className={active === item.href ? "module-tab active" : "module-tab"} href={item.href} key={item.href}>
          <item.icon size={16} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
