// P3: shared server-side pagination for per-coach libraries
// (programs, templates, nutrition, plans). Mirrors the subscribers page
// pattern (?page=, range() + exact count). One page size everywhere.
export const LIB_PAGE_SIZE = 20;

export function parsePageParam(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function pageRange(page: number, size: number = LIB_PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}

export function pageCount(total: number, size: number = LIB_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Clamp a requested page into [1, totalPages]. */
export function clampPage(page: number, total: number, size: number = LIB_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

// F-13: URL serializer for the subscribers list (?status=&q=&page=). Pure so
// the search + filter + pager state is unit-tested. Rules encoded here:
// - the pager must PRESERVE the active search term and status filter;
// - a filter/search change (chips, new search) omits `page` → resets to 1;
// - page 1 / empty values are omitted so hrefs stay canonical.
export function buildSubscribersHref(opts: {
  status?: string | null;
  q?: string | null;
  page?: number | null;
}): string {
  const params = new URLSearchParams();
  const status = (opts.status ?? "").trim();
  const q = (opts.q ?? "").trim();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (typeof opts.page === "number" && Number.isInteger(opts.page) && opts.page > 1) {
    params.set("page", String(opts.page));
  }
  const qs = params.toString();
  return qs ? `/dashboard/subscribers?${qs}` : "/dashboard/subscribers";
}

// F-13: sanitize the search term before it is interpolated into PostgREST
// ilike/or() filters — strips the wildcard/comma-parens characters the live
// parser trips on (same rule as /api/coach/clients/search) and bounds length.
export function sanitizeSearchTerm(raw: unknown, maxLen = 80): string {
  return String(raw ?? "")
    .trim()
    .slice(0, maxLen)
    .replace(/[%_,()]/g, "")
    .trim();
}
