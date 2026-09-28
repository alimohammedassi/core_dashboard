import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { rateLimit } from "@/lib/rate-limit";
import { collectAiDataBundle } from "@/lib/ai/collect";
import { handleAnalysisRequest } from "@/lib/ai/analysis-handler";

// POST /api/ai/analysis — "Analysis with AI" for one client (coach-only).
//
// Thin Next.js adapter: the entire authorization/data/provider flow lives in
// handleAnalysisRequest (src/lib/ai/analysis-handler.ts), extracted verbatim
// so tests/ai-analysis-runtime.test.ts can execute it end-to-end with injected
// fakes. This file only wires the real dependencies and maps the outcome to a
// NextResponse.
//
// Security flow summary (full annotation in analysis-handler.ts):
//   401/403 session+coach auth → coach-scoped subscription lookup (404, no
//   existence leak) → client_id cross-check (400) → rate limit (429) →
//   coach-scoped collection → bounded payload → Gemini only after every gate
//   → strict contract validation with one repair retry → injection screen →
//   JSON. Results are returned, never persisted.

export async function POST(req: NextRequest) {
  const result = await handleAnalysisRequest(
    {
      createClient,
      requireCoachContext,
      rateLimit,
      collectAiDataBundle,
      getToday: () => new Date().toISOString().slice(0, 10),
    },
    req
  );
  return NextResponse.json(result.body, { status: result.status });
}
