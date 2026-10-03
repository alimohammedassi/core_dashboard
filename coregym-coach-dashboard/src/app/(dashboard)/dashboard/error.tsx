"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/core/EmptyState";
import { useI18n } from "@/lib/i18n/client";

// F-03: dashboard error boundary. Server pages distinguish "row genuinely
// missing / not visible (RLS)" → notFound() from "query failed (DB/network)"
// → throw. Thrown errors land here for a real error UI with a retry, instead
// of masquerading as a 404 (or the bare default Next failure page).
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EmptyState
        icon={AlertTriangle}
        title={t("common.state.error")}
        hint={t("common.state.errorHint")}
        action={
          <Button onClick={reset} variant="secondary">
            {t("common.actions.retry")}
          </Button>
        }
      />
    </div>
  );
}
