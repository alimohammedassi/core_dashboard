"use client";

import Link from "next/link";

// S8: dashboard-segment boundary — a failing widget/page shows this instead
// of blanking the whole shell. Generic message; details stay server-side.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Couldn&apos;t load this section</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading this dashboard section
        {error.digest ? (
          <>
            {" "}(reference <span className="font-mono">{error.digest}</span>)
          </>
        ) : null}
        . Your data is safe — try again or pick another section.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          Overview
        </Link>
      </div>
    </div>
  );
}
