// ─────────────────────────────────────────────────────────────────────────────
// AI analysis request flow (extracted verbatim from the API route).
//
// route.ts stays a thin Next.js adapter that wires the REAL dependencies; this
// module owns the actual authorization/data/provider flow as pure control flow
// over injected dependencies — so tests/ai-analysis-runtime.test.ts can execute
// it end-to-end (including the cross-coach and tampering paths) without
// Next.js, Supabase, or the network.
//
// SECURITY FLOW (spec §3) — authorization happens BEFORE any data access and
// BEFORE the provider is invoked:
//   1. authenticate the session user (401)
//   2. requireCoachContext() → resolved coaches.id (403 when absent)
//   3. re-derive the client from the request, scoped to THIS coach:
//      the only accepted identifier is the SUBSCRIPTION id (the dashboard's
//      existing profile-page convention), looked up with
//      coach_id = ctx.coachId — a foreign id is indistinguishable from a
//      missing one (404, no existence leak).
//   4. rate limit per resolved coach (429)
//   5. only then load coach-scoped data (service-role loaders, post-ownership)
//   6. build the bounded payload and call Gemini
//   7. validate the response contract (one repair retry max), return JSON.
//
// Never trusted from the browser: coach ids, client profile ids, any UUID
// other than the coach-owned subscription id, which is re-scoped server-side.
// The browser-supplied client_id is used ONLY as a cross-check and never as
// an authorization source.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAnalysisPayload, inferMissingInformation, AI_BOUNDS, type AiDataBundle } from "./payload.ts";
import { validateAnalysisResult } from "./contract.ts";
import { generateAnalysisText, isGeminiConfigured, parseGeminiJson } from "./gemini.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Coach-level throttle: ~6/hour/coach (spec §20). Per-serverless-instance
// (existing project limitation, documented in the final report).
export const RATE_LIMIT_MAX = 6;
export const RATE_LIMIT_WINDOW_MS = 60 * 60_000;

const GENERIC_FAILURE = "The AI analysis could not be completed. Please try again later.";

export type CoachContext = { userId: string; coachId: string };

// The effectful boundaries of the flow. Payload building, contract validation
// and the provider client are imported from the pure modules; only these five
// dependencies (session/client factory, coach resolution, throttle, collector,
// clock) are injected — replaced by fakes in the runtime test.
export type AnalysisDeps = {
  // user-context (cookie/RLS) client factory — the same createClient the
  // dashboard uses everywhere.
  createClient: () => Promise<SupabaseClient>;
  requireCoachContext: () => Promise<CoachContext | null>;
  rateLimit: (key: string, maxHits: number, windowMs: number) => boolean;
  collectAiDataBundle: (
    supabase: SupabaseClient,
    coachId: string,
    clientId: string,
    today: string
  ) => Promise<AiDataBundle>;
  getToday: () => string;
};

export type AnalysisOutcome = { status: number; body: unknown };

function failResponse(status: number, error: string): AnalysisOutcome {
  return { status, body: { error } };
}

export async function handleAnalysisRequest(
  deps: AnalysisDeps,
  req: { json: () => Promise<unknown> }
): Promise<AnalysisOutcome> {
  // ── 1–2. Authentication + coach identity (never from the request body) ────
  const supabase = await deps.createClient();
  const ctx = await deps.requireCoachContext();
  if (!ctx) {
    // 401 for no session, 403 for a session without a coach row — the same
    // distinction the other dashboard API routes draw via requireCoachContext.
    const user = await supabase.auth.getUser();
    return failResponse(user.data.user ? 403 : 401, user.data.user ? "Coach profile not found" : "Unauthorized");
  }

  // ── 3. Resolve + authorize the client (server-side, coach-scoped) ─────────
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return failResponse(400, "Invalid request body");

  const subscriptionId = String(body.subscription_id ?? "");
  if (!subscriptionId || !UUID_RE.test(subscriptionId)) {
    return failResponse(400, "A valid subscription id is required");
  }
  // The ONLY lookup key for the client: a subscription row owned by this
  // coach. Foreign-owned or random ids both 404 — no existence oracle.
  const svc0 = await deps.createClient(); // user-context client; subscriptions RLS allows own rows
  const { data: sub } = await svc0
    .from("subscriptions")
    .select("id, client_id, status")
    .eq("id", subscriptionId)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!sub) return failResponse(404, "Client not found");

  const clientId = (sub as unknown as { client_id: string }).client_id;
  const subStatus = (sub as unknown as { status: string }).status;
  if (subStatus !== "active") {
    return failResponse(403, "AI analysis requires an active subscription");
  }

  // Cross-check only: if the client supplied a client_id, it must MATCH the
  // subscription's client. It is never used to find the client.
  if (typeof body.client_id === "string" && body.client_id !== "") {
    if (!UUID_RE.test(body.client_id) || body.client_id !== clientId) {
      return failResponse(400, "Client does not match the subscription");
    }
  }

  // ── 4. Rate limit per resolved coach (never by client-supplied ids) ───────
  if (deps.rateLimit(`ai-analysis:${ctx.coachId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return failResponse(429, "Too many analyses — please try again later");
  }

  // ── 5. Load coach-scoped data (service-role loaders, post-ownership) ──────
  const today = deps.getToday();
  let payload: ReturnType<typeof buildAnalysisPayload>;
  try {
    const bundle = await deps.collectAiDataBundle(supabase, ctx.coachId, clientId, today);
    payload = buildAnalysisPayload(bundle);
  } catch (err) {
    console.error("[api:ai-analysis] data collection failed:", err instanceof Error ? err.message : String(err));
    return failResponse(500, GENERIC_FAILURE);
  }

  // Nothing to analyze — refuse BEFORE spending a provider call.
  const hasWorkout = payload.workout_program.weekly_schedule.length > 0;
  const hasNutrition = payload.nutrition_program.weekly_schedule_prescribed.length > 0;
  if (!hasWorkout && !hasNutrition) {
    return failResponse(422, "No assigned workout or nutrition program found for this client");
  }

  if (!isGeminiConfigured()) {
    // Log loudly server-side, never leak why to the client beyond the generic text.
    console.error("[api:ai-analysis] GEMINI_API_KEY is missing or a placeholder in this environment");
    return failResponse(503, "AI analysis is not configured");
  }

  // ── 6. Gemini call (one attempt) + ── 7. contract validation ─────────────
  const payloadJson = JSON.stringify({ payload, required_missing_information: inferMissingInformation(payload) });
  if (payloadJson.length > AI_BOUNDS.payloadMaxBytes) {
    // Defensive bound (the builder already caps every list; this guards
    // against pathological future field additions).
    console.error("[api:ai-analysis] payload exceeded the hard size bound");
    return failResponse(500, GENERIC_FAILURE);
  }

  const first = await generateAnalysisText(payloadJson, "initial");
  if (!first.ok) {
    switch (first.reason) {
      case "not_configured":
        console.error("[api:ai-analysis] GEMINI_API_KEY missing at call time");
        return failResponse(503, "AI analysis is not configured");
      case "rate_limited":
        return failResponse(429, "AI provider is rate limited — please try again later");
      case "timeout":
      case "unavailable":
        return failResponse(502, "AI analysis is temporarily unavailable — please try again later");
      case "malformed":
      default:
        return failResponse(502, GENERIC_FAILURE);
    }
  }

  // Semantic validation against the strict contract.
  let validated = (() => {
    try {
      return validateAnalysisResult(parseGeminiJson(first.text));
    } catch {
      return { ok: false as const, error: "not valid JSON" };
    }
  })();

  // ── The ONE permitted repair retry (spec §17). Not for auth/provider
  //    errors — those already returned above. Skips injection-suspicious
  //    payloads (see below). ────────────────────────────────────────────────
  if (!validated.ok && !injectionSuspicion(first.text)) {
    console.error(`[api:ai-analysis] contract validation failed on first attempt: ${validated.error}`);
    const second = await generateAnalysisText(payloadJson, "repair");
    if (second.ok) {
      try {
        validated = validateAnalysisResult(parseGeminiJson(second.text));
      } catch {
        validated = { ok: false as const, error: "not valid JSON after repair" };
      }
    } else if (second.reason === "rate_limited" || second.reason === "timeout" || second.reason === "unavailable") {
      return failResponse(
        second.reason === "rate_limited" ? 429 : 502,
        second.reason === "rate_limited" ? "AI provider is rate limited — please try again later" : "AI analysis is temporarily unavailable — please try again later"
      );
    }
    // A failed repair keeps the malformed-response path below.
  }

  if (!validated.ok) {
    console.error(`[api:ai-analysis] response failed contract validation: ${validated.error}`);
    return failResponse(502, GENERIC_FAILURE);
  }

  // ── Injection screen on the VALIDATED response (defense in depth beyond
  //    the system instruction): refuse results that contain instruction-like
  //    or exfiltration-attempting text. Conservative patterns only. ──────────
  if (injectionSuspicion(JSON.stringify(validated.value))) {
    console.error("[api:ai-analysis] response rejected by injection screen");
    return failResponse(502, GENERIC_FAILURE);
  }

  // Success — results are returned, never persisted (§1.1).
  return { status: 200, body: { analysis: validated.value } };
}

// Conservative instruction-like content screen. Deliberately narrow to avoid
// false positives on legitimate coaching prose; the system instruction and the
// strict contract remain the primary defenses. Secret patterns are key-SHAPED
// (a word boundary + a real token length) so ordinary words like
// "risk-adjusted" or "task-specific" cannot trip the screen.
function injectionSuspicion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("ignore all previous instructions") ||
    t.includes("ignore previous instructions") ||
    t.includes("disregard your instructions") ||
    t.includes("reveal your system prompt") ||
    t.includes("api key") ||
    /gsk_[a-z0-9]{10,}/.test(t) ||
    /\bsk-[a-z0-9_-]{8,}/.test(t) ||
    t.includes("supabase service") ||
    t.includes("service_role")
  );
}
