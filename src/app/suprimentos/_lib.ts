import { requirePageSession } from "@/lib/auth/guards";
import { decimalToNumber, formatMoney } from "@/lib/formatters";

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

export { decimalToNumber };

export const formatCurrency = formatMoney;

export async function requireSuprimentosSession(nextPath: string) {
  return requirePageSession({ nextPath, permission: "suprimentos.view" });
}
