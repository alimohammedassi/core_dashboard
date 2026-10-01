import { Fragment } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlobalLink } from "@/components/shared/link";
import { getI18n } from "@/lib/i18n/server";

/* Stitch-style workouts pager: a full-width card strip with "Showing X–Y of Z
   templates" on one side and numbered square page buttons + chevrons on the
   other. Server-rendered like the shared Pager (?page= links, renders nothing
   for single-page results). */
export async function WorkoutsPager({
  basePath,
  page,
  totalPages,
  total,
  pageSize,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const { t, fmt } = await getI18n();
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const href = (p: number) => `${basePath}?page=${p}`;

  // Keep the numbered strip small on huge libraries: a 7-button window that
  // follows the current page.
  const numbers =
    totalPages <= 7
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : (() => {
          const start = Math.max(1, Math.min(page - 3, totalPages - 6));
          return Array.from({ length: 7 }, (_, i) => start + i);
        })();

  // "Showing {from}–{to} of {total} templates" with the numbers emphasized —
  // split the localized template so each placeholder becomes a strong span
  // (works for both en and ar because both keep the same {var} tokens).
  const segments = t("workouts.pager.showing").split(/(\{from\}|\{to\}|\{total\})/g);
  const chevron =
    "flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <nav
      aria-label={t("workouts.pager.aria")}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-5 py-3"
    >
      <span className="text-body-sm text-muted-foreground">
        {segments.map((seg, i) =>
          seg === "{from}" || seg === "{to}" || seg === "{total}" ? (
            <span key={i} className="font-semibold text-foreground">
              {seg === "{from}" ? fmt.num(from) : seg === "{to}" ? fmt.num(to) : fmt.num(total)}
            </span>
          ) : (
            <Fragment key={i}>{seg}</Fragment>
          ),
        )}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <GlobalLink href={href(page - 1)} aria-label={t("common.actions.previous")} className={chevron}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </GlobalLink>
        ) : (
          <span aria-hidden className={`${chevron} opacity-40`}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </span>
        )}
        <div className="hidden items-center gap-1 text-label-sm sm:flex">
          {numbers.map((p) =>
            p === page ? (
              <span
                key={p}
                aria-current="page"
                className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground"
              >
                {p}
              </span>
            ) : (
              <GlobalLink
                key={p}
                href={href(p)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {p}
              </GlobalLink>
            ),
          )}
        </div>
        {page < totalPages ? (
          <GlobalLink href={href(page + 1)} aria-label={t("common.actions.next")} className={chevron}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </GlobalLink>
        ) : (
          <span aria-hidden className={`${chevron} opacity-40`}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </span>
        )}
      </div>
    </nav>
  );
}
