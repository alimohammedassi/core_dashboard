// UX-02: client components used to toast raw PostgREST/RLS error messages
// (table names, constraint text) straight to the screen. This helper keeps
// genuinely user-relevant messages (e.g. Supabase Auth's "Password should be
// at least 6 characters") while masking database-engine internals.
//
// Heuristic: PostgREST errors carry a 5-character SQLSTATE in `code` plus
// `details`/`hint` fields; those get the fallback. Anything else (app-authored
// Error, AuthApiError with a readable code) passes through.

function isPostgrestShaped(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; details?: unknown; hint?: unknown };
  const code = e.code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return true;
  return "details" in e || "hint" in e;
}

export function describeError(err: unknown, fallback: string): string {
  if (isPostgrestShaped(err)) {
    console.error("[ui] database error (details withheld from UI):", err);
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  console.error("[ui] failure (details withheld from UI):", err);
  return fallback;
}
