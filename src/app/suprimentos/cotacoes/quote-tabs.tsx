"use client";

import { ReactNode, useState } from "react";
import { ClipboardList, FileSearch, GitCompareArrows } from "lucide-react";

type Props = {
  form: ReactNode;
  map: ReactNode;
  list: ReactNode;
};

const tabs = [
  { id: "lancar", label: "Lancar cotacao", icon: ClipboardList },
  { id: "mapa", label: "Mapa comparativo", icon: GitCompareArrows },
  { id: "lista", label: "Lista e ajustes", icon: FileSearch }
];

export function QuoteTabs({ form, map, list }: Props) {
  const [activeTab, setActiveTab] = useState("lancar");

  return (
    <section className="inner-tabs-shell">
      <div className="inner-tabs" role="tablist" aria-label="Ambientes de cotacoes">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              className={active ? "inner-tab active" : "inner-tab"}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={active}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={activeTab === "lancar" ? "inner-tab-panel active" : "inner-tab-panel"} role="tabpanel">
        {form}
      </div>
      <div className={activeTab === "mapa" ? "inner-tab-panel active" : "inner-tab-panel"} role="tabpanel">
        {map}
      </div>
      <div className={activeTab === "lista" ? "inner-tab-panel active" : "inner-tab-panel"} role="tabpanel">
        {list}
      </div>
    </section>
  );
}
