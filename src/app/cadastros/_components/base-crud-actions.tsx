"use client";

import { useRouter } from "next/navigation";
import { Edit3, Power } from "lucide-react";

type FieldKind = "text" | "select";

type CrudField = {
  key: string;
  label: string;
  value: string;
  kind?: FieldKind;
  options?: Array<{ value: string; label: string }>;
};

type BaseCrudActionsProps = {
  endpoint: string;
  fields: CrudField[];
  active: boolean;
};

export function BaseCrudActions({ endpoint, fields, active }: BaseCrudActionsProps) {
  const router = useRouter();

  async function editRecord() {
    const payload: Record<string, string | boolean> = {};

    for (const field of fields) {
      if (field.kind === "select") {
        const optionsLabel = field.options?.map((option) => `${option.value} = ${option.label}`).join("\n") || "";
        const value = window.prompt(`${field.label}\n${optionsLabel}`, field.value);

        if (value === null) {
          return;
        }

        payload[field.key] = value;
      } else {
        const value = window.prompt(field.label, field.value);

        if (value === null) {
          return;
        }

        payload[field.key] = value;
      }
    }

    payload.active = active;

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel atualizar o cadastro.");
      return;
    }

    router.refresh();
  }

  async function toggleActive() {
    const confirmed = window.confirm(active ? "Inativar este cadastro?" : "Reativar este cadastro?");

    if (!confirmed) {
      return;
    }

    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.alert(data.error || "Nao foi possivel alterar o status.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="quote-action-cell">
      <button className="icon-button" type="button" onClick={editRecord} title="Editar">
        <Edit3 size={16} />
      </button>
      <button className={active ? "icon-button danger" : "icon-button"} type="button" onClick={toggleActive} title={active ? "Inativar" : "Reativar"}>
        <Power size={16} />
      </button>
    </div>
  );
}
