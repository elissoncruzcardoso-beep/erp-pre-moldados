import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const statusLabels: Record<string, string> = {
  ABERTA: "Aberta",
  EM_COTACAO: "Em cotacao",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  CONVERTIDA_PEDIDO: "Convertida em pedido",
  CANCELADA: "Cancelada"
};

export const quoteStatusLabels: Record<string, string> = {
  RECEBIDA: "Recebida",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  CANCELADA: "Cancelada"
};

export const orderStatusLabels: Record<string, string> = {
  EMITIDO: "Emitido",
  ENVIADO: "Enviado",
  PARCIALMENTE_RECEBIDO: "Parcial",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

export const receiptStatusLabels: Record<string, string> = {
  LIBERADO_ESTOQUE: "Liberado estoque",
  DIVERGENTE: "Divergente",
  CANCELADO: "Cancelado"
};

export function quoteBadgeClass(status: string) {
  if (status === "APROVADA") return "badge green";
  if (status === "REPROVADA" || status === "CANCELADA") return "badge red";
  return "badge blue";
}

export function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

export function formatCurrency(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export async function requireSuprimentosSession(nextPath: string) {
  const session = await getSession();

  if (!session) {
    redirect(`/login?next=${nextPath}`);
  }

  if (!session.permissions.includes("suprimentos.view")) {
    redirect("/dashboard");
  }

  return session;
}
