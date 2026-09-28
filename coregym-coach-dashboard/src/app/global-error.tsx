"use client";

// S8: last-resort boundary for root-layout failures. Must render its own
// <html>/<body> and cannot rely on app providers or styles.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#666" }}>
              The app failed to start. Please reload the page.
            </p>
            <button type="button" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
