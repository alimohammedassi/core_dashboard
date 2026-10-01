// ─────────────────────────────────────────────────────────────────────────────
// AI proposal-apply request flow (extracted from the API route).
//
// route.ts stays a thin Next.js adapter; this module owns the actual
// authorization/validation/apply flow as pure control flow over injected
// dependencies — so tests/ai-proposal-apply.test.ts can execute it end-to-end
// (including cross-coach, conflict, unmatched-food and compensation paths)
// without Next.js, Supabase, or the network. Same pattern as
// src/lib/ai/analysis-handler.ts.
//
// SECURITY FLOW — authorization happens BEFORE any data access or write:
//   1. requireCoachContext() → resolved coaches.id (403 when absent)
//   2. resolve the client from the coach-owned ACTIVE subscription (404, no
//      existence oracle; 403 when the subscription is not active)
//   3. kind/date/duration validation (400)
//   4. one-active-enrollment guard (409) — same rule as /api/program-enrollments
//   5. proposal re-validated with the exact contract functions the analysis
//      response was validated against (400) — the browser is never trusted
//   6. apply via the EXISTING atomic RPCs; every failure path compensates by
//      deleting rows created earlier in the chain (no orphans, no partials).
//
// Never trusted from the browser: coach ids, client ids, program/enrollment
// ownership, catalog food ids. AI content boundaries: nutrition proposals may
// reference ONLY foods resolvable in the shared catalog (exact case-insensitive
// name match; ambiguous → never guessed) — no catalog rows are created.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateWorkoutProposal,
  validateNutritionProposal,
  type WorkoutProposal,
  type NutritionProposal,
} from "./contract.ts";

// Local weekday labels for template naming — mirrors programs.ts weekdayLabel
// but kept here (pure) so this module loads under node --test without pulling
// in server-only Supabase client modules.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Names are matched per query chunk (bounded URL length); each pattern is
// quoted so commas/parens in food names survive PostgREST's or= parsing.
const FOOD_QUERY_CHUNK = 40;

export type CoachContext = { userId: string; coachId: string };

export type ProposalApplyDeps = {
  createServiceClient: () => Promise<SupabaseClient>;
  requireCoachContext: () => Promise<CoachContext | null>;
};

export type ProposalApplyOutcome = { status: number; body: unknown };

type UnresolvedFood = { name: string; reason: "not_found" | "ambiguous"; candidates?: string[] };
type FoodMatch = { id: string; name: string };

function failResponse(status: number, body: unknown): ProposalApplyOutcome {
  return { status, body };
}

export async function handleProposalApplyRequest(
  deps: ProposalApplyDeps,
  body: unknown
): Promise<ProposalApplyOutcome> {
  // ── 1. Coach identity (never from the request body) ─────────────────────────
  const ctx = await deps.requireCoachContext();
  if (!ctx) return failResponse(403, { error: "Coach profile not found" });

  if (body == null || typeof body !== "object") return failResponse(400, { error: "Invalid request body" });
  const b = body as Record<string, unknown>;

  // ── 2. Resolve + authorize the client through the coach-owned subscription ──
  const subscriptionId = String(b.subscription_id ?? "");
  if (!subscriptionId || !UUID_RE.test(subscriptionId)) {
    return failResponse(400, { error: "A valid subscription id is required" });
  }
  const svc = await deps.createServiceClient();
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id, client_id, status")
    .eq("id", subscriptionId)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!sub) return failResponse(404, { error: "Client not found" });
  const clientId = (sub as unknown as { client_id: string }).client_id;
  if ((sub as unknown as { status: string }).status !== "active") {
    return failResponse(403, { error: "Applying a proposal requires an active subscription" });
  }

  // ── 3. Kind + start date + duration ─────────────────────────────────────────
  const kind = String(b.kind ?? "");
  if (kind !== "workout" && kind !== "nutrition") {
    return failResponse(400, { error: "kind must be workout or nutrition" });
  }
  const startDate = String(b.start_date ?? "");
  if (!DATE_RE.test(startDate) || Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime())) {
    return failResponse(400, { error: "A valid start date is required" });
  }
  const durationWeeks = Number(b.duration_weeks);
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 52) {
    return failResponse(400, { error: "Duration must be between 1 and 52 weeks" });
  }

  // ── 4. One-active-enrollment rule (same guard as /api/program-enrollments) ──
  const enrollmentTable = kind === "workout" ? "client_program_enrollments" : "client_nutrition_enrollments";
  const { data: existingEnrollment } = await svc
    .from(enrollmentTable)
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();
  if (existingEnrollment) {
    return failResponse(409, {
      error:
        kind === "workout"
          ? "This client already has an active program. Remove or pause it before enrolling a new one."
          : "This client already has an active nutrition program. Remove or pause it before enrolling a new one.",
    });
  }

  // ── 5. Re-validate the proposal server-side (same contract as the analysis) ─
  if (kind === "workout") {
    const parsed = validateWorkoutProposal(b.proposal);
    if (!parsed.ok) return failResponse(400, { error: parsed.error });
    return applyWorkout(svc, ctx.coachId, clientId, parsed.value, startDate, durationWeeks);
  }
  const parsed = validateNutritionProposal(b.proposal);
  if (!parsed.ok) return failResponse(400, { error: parsed.error });
  return applyNutrition(svc, ctx.coachId, clientId, parsed.value, startDate, durationWeeks);
}

// ── Workout apply ─────────────────────────────────────────────────────────────
// template per proposal day → weekly program → enrollment. Any failure deletes
// everything created so far before returning (no orphans).

export async function applyWorkout(
  svc: SupabaseClient,
  coachId: string,
  clientId: string,
  proposal: WorkoutProposal,
  startDate: string,
  durationWeeks: number
): Promise<ProposalApplyOutcome> {
  const createdTemplateIds: string[] = [];
  let programId: string | null = null;

  const cleanup = async () => {
    if (programId) {
      await svc.from("coach_programs").delete().eq("id", programId).eq("coach_id", coachId);
    }
    if (createdTemplateIds.length > 0) {
      await svc.from("workout_templates").delete().in("id", createdTemplateIds).eq("coach_id", coachId);
    }
  };

  // One template per proposal day; the day's focus becomes the muscle tag so
  // the created templates look exactly like hand-built ones in the library.
  for (const [i, day] of proposal.days.entries()) {
    const name = `${proposal.name} - ${weekdayLabel(day.day_of_week)}`.slice(0, 200);
    const { data: templateId, error } = await svc.rpc("create_workout_template_atomic", {
      p_coach_id: coachId,
      p_name: name,
      p_target_muscles: day.focus ? [day.focus] : [],
      p_notes: day.notes,
      p_exercises: day.exercises.map((e, order) => ({
        exercise_name: e.name,
        target_sets: e.sets,
        target_reps: e.reps,
        target_weight_kg: e.weight_kg,
        rest_sec: e.rest_sec,
        notes: e.notes,
        order_index: order,
      })),
    });
    if (error) {
      console.error(`[api:ai/proposal-apply] template ${i + 1}/${proposal.days.length} failed:`, error.message);
      await cleanup();
      return failResponse(400, { error: "Something went wrong. Please try again." });
    }
    createdTemplateIds.push(templateId as string);
  }

  const { data: createdProgramId, error: programError } = await svc.rpc("upsert_coach_program_atomic", {
    p_program_id: null,
    p_coach_id: coachId,
    p_name: proposal.name,
    p_description: proposal.description,
    p_days: proposal.days.map((day, i) => ({
      day_of_week: day.day_of_week,
      template_id: createdTemplateIds[i],
      order_index: i,
    })),
  });
  if (programError) {
    console.error("[api:ai/proposal-apply] program creation failed:", programError.message);
    await cleanup();
    return failResponse(400, { error: "Something went wrong. Please try again." });
  }
  programId = createdProgramId as string;

  const { data: enrollmentId, error: enrollError } = await svc.rpc("create_program_enrollment_atomic", {
    p_program_id: programId,
    p_coach_id: coachId,
    p_client_id: clientId,
    p_start_date: startDate,
    p_duration_weeks: durationWeeks,
  });
  if (enrollError) {
    console.error("[api:ai/proposal-apply] enrollment failed:", enrollError.message);
    await cleanup();
    return failResponse(400, { error: "Something went wrong. Please try again." });
  }

  return failResponse(200, { program_id: programId, enrollment_id: enrollmentId });
}

// ── Nutrition apply ───────────────────────────────────────────────────────────
// Resolve every AI food name against the shared catalog FIRST (read-only), so
// an unresolved proposal never creates anything. Exact case-insensitive match;
// multiple exact matches are ambiguous and never guessed.

function foodNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function resolveFoods(
  svc: SupabaseClient,
  names: string[]
): Promise<{ matches: Map<string, FoodMatch>; unresolved: UnresolvedFood[] }> {
  const matches = new Map<string, FoodMatch>();
  const unresolved: UnresolvedFood[] = [];

  for (let i = 0; i < names.length; i += FOOD_QUERY_CHUNK) {
    const chunk = names.slice(i, i + FOOD_QUERY_CHUNK);
    // Patterns are quoted for PostgREST; embedded quotes/backslashes are
    // dropped (wildcard chars % _ stay — they only widen the candidate set,
    // and the exact post-filter below decides).
    const or = chunk.map((n) => `name.ilike."${n.replace(/["\\]/g, "")}"`).join(",");
    const { data, error } = await svc.from("foods").select("id, name").or(or);
    if (error) throw new Error(error.message);

    const rows = ((data ?? []) as { id: string; name: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
      lower: foodNameKey(r.name),
    }));

    for (const name of chunk) {
      const exact = rows.filter((r) => r.lower === foodNameKey(name));
      if (exact.length === 1) {
        matches.set(foodNameKey(name), { id: exact[0].id, name: exact[0].name });
      } else if (exact.length === 0) {
        unresolved.push({ name, reason: "not_found" });
      } else {
        unresolved.push({
          name,
          reason: "ambiguous",
          candidates: [...new Set(exact.map((e) => e.name))].slice(0, 5),
        });
      }
    }
  }
  return { matches, unresolved };
}

export async function applyNutrition(
  svc: SupabaseClient,
  coachId: string,
  clientId: string,
  proposal: NutritionProposal,
  startDate: string,
  durationWeeks: number
): Promise<ProposalApplyOutcome> {
  // Unique food names across the whole proposal — deduped case-insensitively,
  // keeping the first-seen original casing for coach-facing error output.
  const byKey = new Map<string, string>();
  for (const name of proposal.days.flatMap((d) => d.meals.flatMap((m) => m.foods.map((f) => f.name)))) {
    const key = foodNameKey(name);
    if (key !== "" && !byKey.has(key)) byKey.set(key, name.trim());
  }
  const uniqueNames = [...byKey.values()];

  let matches: Map<string, FoodMatch>;
  let tree: { day_of_week: number; notes: string | null; meals: { name: string; foods: { food_id: string; quantity: number }[] }[] }[];
  try {
    const resolved = await resolveFoods(svc, uniqueNames);
    if (resolved.unresolved.length > 0) {
      // Nothing has been written yet — the coach fixes or replaces these foods.
      return failResponse(422, { error: "UNMATCHED_FOODS", foods: resolved.unresolved });
    }
    matches = resolved.matches;
    tree = proposal.days.map((day) => ({
      day_of_week: day.day_of_week,
      notes: day.notes,
      meals: day.meals.map((meal) => ({
        name: meal.name,
        foods: meal.foods.map((food) => {
          const match = matches.get(foodNameKey(food.name));
          if (!match) throw new Error("resolved food match vanished"); // unreachable — all names pre-resolved
          return { food_id: match.id, quantity: food.quantity };
        }),
      })),
    }));
  } catch (err) {
    console.error("[api:ai/proposal-apply] foods resolution failed:", err instanceof Error ? err.message : String(err));
    return failResponse(500, { error: "Something went wrong. Please try again." });
  }

  const { data: programId, error: programError } = await svc.rpc("upsert_nutrition_program_atomic", {
    p_program_id: null,
    p_coach_id: coachId,
    p_name: proposal.name,
    p_description: proposal.description,
    p_tree: tree,
  });
  if (programError) {
    console.error("[api:ai/proposal-apply] nutrition program creation failed:", programError.message);
    return failResponse(400, { error: "Something went wrong. Please try again." });
  }

  const { data: enrollmentId, error: enrollError } = await svc.rpc("create_nutrition_enrollment_atomic", {
    p_program_id: programId as string,
    p_coach_id: coachId,
    p_client_id: clientId,
    p_start_date: startDate,
    p_duration_weeks: durationWeeks,
  });
  if (enrollError) {
    console.error("[api:ai/proposal-apply] nutrition enrollment failed:", enrollError.message);
    // Enrollment is the only write after program creation — compensate.
    await svc.from("nutrition_programs").delete().eq("id", programId as string).eq("coach_id", coachId);
    return failResponse(400, { error: "Something went wrong. Please try again." });
  }

  return failResponse(200, { program_id: programId, enrollment_id: enrollmentId });
}
