import { NextResponse } from "next/server";

// OBS-01: minimal liveness/readiness probe. Verifies (1) the process answers
// and (2) the Supabase REST endpoint is reachable — the two dependencies every
// dashboard page shares. Read-only; never touches tenant data. Intentionally
// unauthenticated so platform monitors (and humans) can hit it; it exposes no
// configuration values, only component statuses.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const checks: Record<string, string> = {
    server: "ok",
    supabase_env: url && key ? "ok" : "missing",
  };

  if (url && key) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      checks.supabase_auth = res.ok ? "ok" : `http_${res.status}`;
    } catch (e: unknown) {
      checks.supabase_auth = "unreachable";
      console.error("[health] supabase auth probe failed", e);
    }
  }

  const degraded = Object.values(checks).some((v) => v !== "ok");
  return NextResponse.json({ status: degraded ? "degraded" : "ok", checks }, { status: degraded ? 503 : 200 });
}

export const dynamic = "force-dynamic";
