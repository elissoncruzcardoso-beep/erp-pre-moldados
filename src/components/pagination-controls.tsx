import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPageHref, type PaginationMeta, type SearchParamsLike } from "@/lib/pagination";

type PaginationControlsProps = {
  pathname: string;
  params: SearchParamsLike;
  meta: PaginationMeta;
  pageParam?: string;
  pageSizeParam?: string;
};

export function PaginationControls({
  pathname,
  params,
  meta,
  pageParam = "page",
  pageSizeParam = "pageSize"
}: PaginationControlsProps) {
  const previousHref = buildPageHref(pathname, params, meta.page - 1, { pageParam, pageSizeParam });
  const nextHref = buildPageHref(pathname, params, meta.page + 1, { pageParam, pageSizeParam });

  return (
    <nav className="pagination-controls" aria-label="Paginacao">
      <div>
        <strong className="mono">{meta.total}</strong>
        <span>registro(s)</span>
      </div>
      <span className="pagination-status">
        Pagina {meta.page} de {meta.totalPages}
      </span>
      <div className="pagination-actions">
        {meta.hasPrevious ? (
          <Link className="secondary-button mini-button" href={previousHref}>
            <ChevronLeft size={14} />
            Anterior
          </Link>
        ) : (
          <span className="secondary-button mini-button disabled-button">
            <ChevronLeft size={14} />
            Anterior
          </span>
        )}
        {meta.hasNext ? (
          <Link className="secondary-button mini-button" href={nextHref}>
            Proxima
            <ChevronRight size={14} />
          </Link>
        ) : (
          <span className="secondary-button mini-button disabled-button">
            Proxima
            <ChevronRight size={14} />
          </span>
        )}
      </div>
    </nav>
  );
}
