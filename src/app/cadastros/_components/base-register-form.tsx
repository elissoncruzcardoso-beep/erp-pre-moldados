"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type BaseRegisterFormProps = {
  endpoint: string;
  children: ReactNode;
  submitLabel: string;
  successMessage: string;
  formType: "unit" | "inputGroup" | "financialGroup" | "customer" | "supplier" | "paymentMethod" | "settlementType";
};

export function BaseRegisterForm({
  endpoint,
  children,
  submitLabel,
  successMessage,
  formType
}: BaseRegisterFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const form = event.currentTarget;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(formType, new FormData(form)))
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Nao foi possivel salvar o cadastro.");
      return;
    }

    form.reset();
    setMessage(successMessage);
    router.refresh();
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      {children}
      {error ? <p className="auth-error">{error}</p> : null}
      {message ? <p className="auth-success">{message}</p> : null}
      <button className="primary-button" type="submit" disabled={loading}>
        <Save size={17} />
        {loading ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}

function buildPayload(formType: BaseRegisterFormProps["formType"], formData: FormData) {
  if (formType === "unit") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      decimals: formData.get("decimals")
    };
  }

  if (formType === "inputGroup") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      type: formData.get("type"),
      defaultFinancialGroupId: formData.get("defaultFinancialGroupId") || undefined,
      controlsStock: formData.get("controlsStock") === "on",
      note: formData.get("note") || undefined,
      active: true
    };
  }

  if (formType === "financialGroup") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      type: formData.get("type"),
      category: formData.get("category") || undefined,
      costCenter: formData.get("costCenter") || undefined,
      note: formData.get("note") || undefined,
      active: true
    };
  }

  if (formType === "customer") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      document: formData.get("document") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone") || undefined,
      address: formData.get("address") || undefined,
      city: formData.get("city") || undefined,
      state: formData.get("state") || undefined,
      active: true
    };
  }

  if (formType === "supplier") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      document: formData.get("document") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone") || undefined,
      active: true
    };
  }

  if (formType === "paymentMethod") {
    return {
      code: formData.get("code"),
      name: formData.get("name"),
      type: formData.get("type"),
      note: formData.get("note") || undefined,
      active: true
    };
  }

  return {
    code: formData.get("code"),
    name: formData.get("name"),
    direction: formData.get("direction"),
    note: formData.get("note") || undefined,
    active: true
  };
}
