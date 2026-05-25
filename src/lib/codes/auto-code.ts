const itemTypePrefixes: Record<string, string> = {
  MATERIA_PRIMA: "MP",
  INSUMO: "INS",
  PRODUTO_ACABADO: "PA",
  PECA_PRE_MOLDADA: "PM",
  FORMA_MOLDE: "FM",
  SERVICO: "SRV"
};

export function makeAutomaticCode(prefix: string, date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const suffix = String(Math.floor(Math.random() * 900) + 100);

  return `${prefix}-${year}${month}${day}-${hour}${minute}${second}-${suffix}`.toUpperCase().slice(0, 40);
}

export function normalizeManualCode(value: string | undefined | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

export function makeItemCode(type: string) {
  return makeAutomaticCode(itemTypePrefixes[type] || "ITEM");
}
