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
