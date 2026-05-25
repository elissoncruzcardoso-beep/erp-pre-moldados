import { Prisma, type Item } from "@prisma/client";

export type BotProductOption = Pick<Item, "id" | "code" | "description">;

export type ParsedProductionDailyMessage = {
  logDate: Date;
  teamPresent: string;
  weatherMorning: string;
  weatherAfternoon: string;
  observation?: string;
  items: Array<{
    itemId: string;
    quantity: number;
    note?: string;
    rawName: string;
    matchedProduct: string;
  }>;
  unmatchedItems: string[];
};

type ParsedLineItem = {
  name: string;
  quantity: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/D\s*=?\s*(\d+)/g, "D$1")
    .replace(/ALT\s*=?\s*/g, "ALT")
    .replace(/ESP\s*=?\s*/g, "ESP")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function makeTokens(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function parseDate(lines: string[]) {
  const dateLine = lines.find((line) => /di[aá]rio|data/i.test(line));
  const match = dateLine?.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);

  if (!match) {
    return new Date();
  }

  const now = new Date();
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3] ? Number(match[3]) : now.getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  return new Date(Date.UTC(year, month - 1, day));
}

function getValueAfterLabel(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map((label) => normalizeText(label));

  for (const line of lines) {
    const normalized = normalizeText(line);
    const matchedLabel = normalizedLabels.find((label) => normalized.startsWith(label));

    if (matchedLabel) {
      const separatorIndex = Math.max(line.indexOf(":"), line.indexOf("-"));
      return separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : line.trim();
    }
  }

  return "";
}

function getProductionLines(lines: string[]) {
  const startIndex = lines.findIndex((line) => /^produ[cç][aã]o/i.test(line.trim()));

  if (startIndex < 0) {
    return lines;
  }

  const productionLines: string[] = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (/^(observa[cç][aã]o|obs|equipe|manh[aã]|tarde)\s*[:\-]/i.test(line)) {
      break;
    }

    productionLines.push(line);
  }

  return productionLines;
}

function parseProductionItems(lines: string[]) {
  const items: ParsedLineItem[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    const match = cleaned.match(/^(.+?)(?:\s*[:=-]\s*|\s+)(\d+(?:[,.]\d+)?)\s*(?:un|und|pecas|pe[cç]as)?$/i);

    if (!match) {
      continue;
    }

    const name = match[1].trim();
    const quantity = Number(match[2].replace(",", "."));

    if (name.length >= 2 && quantity > 0) {
      items.push({ name, quantity });
    }
  }

  return items;
}

function scoreProductMatch(rawName: string, product: BotProductOption) {
  const queryTokens = makeTokens(rawName);
  const productTokens = new Set(makeTokens(`${product.code} ${product.description}`));

  if (queryTokens.length === 0) {
    return 0;
  }

  const exactCode = normalizeText(rawName).includes(normalizeText(product.code));
  const exactDescription = normalizeText(product.description).includes(normalizeText(rawName));
  const overlap = queryTokens.filter((token) => productTokens.has(token)).length;

  return (exactCode ? 10 : 0) + (exactDescription ? 6 : 0) + overlap;
}

function matchProduct(rawName: string, products: BotProductOption[]) {
  const ranked = products
    .map((product) => ({
      product,
      score: scoreProductMatch(rawName, product)
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score > 0 ? ranked[0].product : null;
}

export function normalizeBotDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function buildProductionBatchCode(logDate: Date, sequence: number) {
  const stamp = logDate.toISOString().slice(0, 10).replace(/-/g, "");
  return `LOTE-${stamp}-${String(sequence).padStart(3, "0")}`;
}

export function parseProductionDailyMessage(
  text: string,
  products: BotProductOption[]
): ParsedProductionDailyMessage {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsedItems = parseProductionItems(getProductionLines(lines));
  const items: ParsedProductionDailyMessage["items"] = [];
  const unmatchedItems: string[] = [];

  for (const item of parsedItems) {
    const product = matchProduct(item.name, products);

    if (!product) {
      unmatchedItems.push(item.name);
      continue;
    }

    items.push({
      itemId: product.id,
      quantity: item.quantity,
      rawName: item.name,
      matchedProduct: `${product.code} - ${product.description}`
    });
  }

  const observation = getValueAfterLabel(lines, ["Observacao", "Observação", "Obs"]);

  return {
    logDate: normalizeBotDate(parseDate(lines)),
    teamPresent: getValueAfterLabel(lines, ["Equipe", "Equipe presente", "Nome dos trabalhadores presentes"]) || "Nao informado pelo bot",
    weatherMorning: getValueAfterLabel(lines, ["Manha", "Manhã"]) || "Nao informado",
    weatherAfternoon: getValueAfterLabel(lines, ["Tarde"]) || "Nao informado",
    observation: observation || undefined,
    items,
    unmatchedItems
  };
}

export function makeDecimal(value: number) {
  return new Prisma.Decimal(value);
}
