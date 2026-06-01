export function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

export function formatMoney(value: unknown, options?: Intl.NumberFormatOptions) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    ...options
  });
}

export const formatCurrency = formatMoney;

export function formatQuantity(value: unknown, options?: Intl.NumberFormatOptions) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3,
    ...options
  });
}

export function formatQuantityWithUnit(value: unknown, unitCode: string) {
  return `${formatQuantity(value)} ${unitCode}`;
}

export function formatDate(value: Date) {
  return value.toLocaleDateString("pt-BR");
}

export function formatDateTime(value: Date) {
  return value.toLocaleString("pt-BR");
}
