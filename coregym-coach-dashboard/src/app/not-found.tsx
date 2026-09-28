import Link from "next/link";

// S8: branded 404 (previously the default Next.js page).
export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist or was moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
