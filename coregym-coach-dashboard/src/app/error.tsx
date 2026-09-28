"use client";

import { useI18n } from "@/lib/i18n/client";

// S8: root error boundary — generic message only, never leaks DB/Stripe
// internals (those stay in server logs). `reset` retries the segment.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
        <h1 className="text-xl font-semibold">{t("common.state.error")}</h1>
        <p className="text-sm text-muted-foreground">
          {error.digest
            ? t("misc.errors.rootBody", { digest: error.digest })
            : t("misc.errors.rootBodyNoDigest")}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          {t("common.actions.retry")}
        </button>
      </div>
    </div>
  );
}
