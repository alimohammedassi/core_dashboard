import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
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
