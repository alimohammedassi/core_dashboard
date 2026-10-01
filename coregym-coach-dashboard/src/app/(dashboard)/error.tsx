"use client";

import { GlobalLink } from "@/components/shared/link";
import { useI18n } from "@/lib/i18n/client";

// S8: dashboard-segment boundary — a failing widget/page shows this instead
// of blanking the whole shell. Generic message; details stay server-side.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("misc.errors.sectionTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {error.digest
          ? t("misc.errors.sectionBody", { digest: error.digest })
          : t("misc.errors.sectionBodyNoDigest")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t("common.actions.retry")}
        </button>
        <GlobalLink
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          {t("common.nav.overview")}
        </GlobalLink>
      </div>
    </div>
  );
}
