export type SearchParamsLike = Record<string, string | string[] | undefined>;

type ParsePaginationOptions = {
  pageParam?: string;
  pageSizeParam?: string;
  defaultPageSize?: number;
  maxPageSize?: number;
};

export type PaginationState = {
  page: number;
  pageSize: number;
  skip: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

function firstParam(params: SearchParamsLike, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePagination(params: SearchParamsLike, options: ParsePaginationOptions = {}): PaginationState {
  const {
    pageParam = "page",
    pageSizeParam = "pageSize",
    defaultPageSize = 20,
    maxPageSize = 100
  } = options;

  const page = parsePositiveInteger(firstParam(params, pageParam), 1);
  const rawPageSize = parsePositiveInteger(firstParam(params, pageSizeParam), defaultPageSize);
  const pageSize = Math.min(rawPageSize, maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

export function getPaginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages
  };
}

export function buildPageHref(
  pathname: string,
  params: SearchParamsLike,
  page: number,
  options: Pick<ParsePaginationOptions, "pageParam" | "pageSizeParam"> = {}
) {
  const pageParam = options.pageParam || "page";
  const pageSizeParam = options.pageSizeParam || "pageSize";
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue) query.set(key, firstValue);
  });

  query.set(pageParam, String(page));

  if (!query.has(pageSizeParam)) {
    query.set(pageSizeParam, "20");
  }

  return `${pathname}?${query.toString()}`;
}
