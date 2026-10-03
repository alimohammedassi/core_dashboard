import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { rateLimit } from "@/lib/rate-limit";
import { handleProposalApplyRequest } from "@/lib/ai/proposal-apply-handler";

// POST /api/ai/proposal-apply — apply a coach-approved AI proposal.
//
// Thin Next.js adapter: the entire authorization/validation/apply flow lives
// in handleProposalApplyRequest (src/lib/ai/proposal-apply-handler.ts) so
// tests can execute it end-to-end with injected fakes — same pattern as
// /api/ai/analysis. This file only wires the real dependencies and maps the
// outcome to a NextResponse.
//
// Security summary (full annotation in the handler): requireCoachContext →
// coach-scoped active-subscription client resolution (404, no existence
// leak) → one-active-enrollment 409 → contract re-validation → existing
// atomic RPCs with compensating cleanup. Never persists AI output as truth
// without the coach's explicit apply action.

export async function POST(req: NextRequest) {
  // API-05: apply is an expensive multi-write (LLM-derived program tree via
  // atomic RPCs) — 10/min per coach/instance. Unauthenticated callers fall
  // through so the handler owns its own 401/403 contract.
  const ctx = await requireCoachContext();
  if (ctx && rateLimit(`ai-apply:${ctx.coachId}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many apply attempts — please wait a moment" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }
  const body = await req.json().catch(() => null);
  const result = await handleProposalApplyRequest(
    {
      createServiceClient,
      requireCoachContext,
    },
    body
  );
  // no-store: the response concerns client-specific program data.
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
