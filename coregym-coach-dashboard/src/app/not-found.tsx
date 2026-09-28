import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

// S8: branded 404 (previously the default Next.js page).
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
        <h1 className="text-xl font-semibold">{t("misc.notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("misc.notFound.body")}</p>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          {t("misc.notFound.backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
