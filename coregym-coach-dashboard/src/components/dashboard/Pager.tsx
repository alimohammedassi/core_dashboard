import { GlobalLink } from "@/components/shared/link";
import { getI18n } from "@/lib/i18n/server";

// P3: server-rendered pager for library pages (?page=). Renders nothing for
// single-page results so small libraries are visually unchanged.
export async function Pager({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  const { t } = await getI18n();
  if (totalPages <= 1) return null;
  const prev = page > 1 ? `${basePath}?page=${page - 1}` : null;
  const next = page < totalPages ? `${basePath}?page=${page + 1}` : null;
  return (
    <nav aria-label={t("overview.pager.aria")} className="flex items-center justify-center gap-3 pt-2 text-sm">
      {prev ? (
        <GlobalLink href={prev} className="inline-flex h-8 items-center rounded-md border px-3">
          {t("common.actions.previous")}
        </GlobalLink>
      ) : (
        <span className="inline-flex h-8 items-center rounded-md border px-3 opacity-40">
          {t("common.actions.previous")}
        </span>
      )}
      <span className="text-muted-foreground">{t("overview.pager.pageOf", { page, total: totalPages })}</span>
      {next ? (
        <GlobalLink href={next} className="inline-flex h-8 items-center rounded-md border px-3">
          {t("common.actions.next")}
        </GlobalLink>
      ) : (
        <span className="inline-flex h-8 items-center rounded-md border px-3 opacity-40">
          {t("common.actions.next")}
        </span>
      )}
    </nav>
  );
}
