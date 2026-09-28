"use client";

// S8: root error boundary — generic message only, never leaks DB/Stripe
// internals (those stay in server logs). `reset` retries the segment.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The page failed to load. Please try again — if it keeps happening, contact support
          {error.digest ? (
            <>
              {" "}and mention reference <span className="font-mono">{error.digest}</span>
            </>
          ) : null}
          .
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
