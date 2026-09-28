import Link from "next/link";

// P3: server-rendered pager for library pages (?page=). Renders nothing for
// single-page results so small libraries are visually unchanged.
export function Pager({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const prev = page > 1 ? `${basePath}?page=${page - 1}` : null;
  const next = page < totalPages ? `${basePath}?page=${page + 1}` : null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-2 text-sm">
      {prev ? (
        <Link href={prev} className="inline-flex h-8 items-center rounded-md border px-3">
          Previous
        </Link>
      ) : (
        <span className="inline-flex h-8 items-center rounded-md border px-3 opacity-40">Previous</span>
      )}
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {next ? (
        <Link href={next} className="inline-flex h-8 items-center rounded-md border px-3">
          Next
        </Link>
      ) : (
        <span className="inline-flex h-8 items-center rounded-md border px-3 opacity-40">Next</span>
      )}
    </nav>
  );
}
