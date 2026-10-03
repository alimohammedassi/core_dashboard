// ─────────────────────────────────────────────────────────────────────────────
// Server-side data collection for the AI analysis payload.
//
// IMPORTS SERVER SUPABASE — call only after requireCoachContext() has resolved
// the coach and the client's ownership/eligibility has been verified by the
// route. This module is the only place that touches the database; payload.ts
// stays pure and gemini.ts stays network-only.
//
// Minimization policy (spec §4.4):
//   * email and avatar are NEVER selected — the allowlist is per-column;
//   * optional sensitive context (body_measurements, daily summaries, sleep,
//     steps) is DISABLED BY DEFAULT (INCLUDE_OPTIONAL_CONTEXT = false). V1
//     does not expose a coach toggle, so nothing optional is ever sent.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiDataBundle,
  BundleClientChange,
  BundleEnrollment,
  BundleMeasurement,
  BundleNutritionDay,
  BundleWeeklyNutritionAdapter,
  BundleWeeklyVolume,
  BundlePersonalRecord,
} from "@/lib/ai/payload";
import { createServiceClient } from "@/lib/supabase/server";
import { loadClientPrescription, loadClientProgress } from "@/lib/workouts";
import { loadNutritionEnrollmentDetail, loadRecentNutritionChanges } from "@/lib/nutrition";

// Locked for V1 (spec §1.4): optional sensitive context stays off until a
// coach-controlled include option is explicitly built and reviewed.
const INCLUDE_OPTIONAL_CONTEXT = false;

export async function collectAiDataBundle(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  today: string
): Promise<AiDataBundle> {
  // 1) Client profile — allowlisted columns only (no email, no avatar_url).
  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("full_name, name, age, gender, height_cm, weight_kg, fitness_goal")
    .eq("id", clientId)
    .maybeSingle();
  const profile = (profileRaw ?? null) as unknown as {
    full_name: string | null;
    name: string | null;
    age: number | null;
    gender: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    fitness_goal: string | null;
  } | null;

  // 2) Client numeric goals (optional context — null when the row/read is
  //    unavailable; never guessed). A missing row yields available=true with
  //    null fields; a structurally unavailable read yields goals=null, which
  //    maps to numeric_goals.available=false in the payload.
  //    Read via the service role: user_goals RLS has no coach policy, so the
  //    user-context read always returned empty and the AI never saw goal
  //    targets. Same trust contract as loadClientPrescription/loadClientProgress
  //    — this collector only runs AFTER the route verified, scoped to the
  //    resolved coach, that the client belongs to this coach.
  const svc = await createServiceClient();
  const { data: goalsRaw } = await svc
    .from("user_goals")
    .select("daily_calories, weekly_workouts, target_weight_kg")
    .eq("user_id", clientId)
    .maybeSingle();
  const goals = (goalsRaw ?? null) as unknown as {
    daily_calories: number | null;
    weekly_workouts: number | null;
    target_weight_kg: number | null;
  } | null;

  // 3) Active subscription context (plan name for framing only).
  const { data: subRaw } = await supabase
    .from("subscriptions")
    .select("status, plan:subscription_plans(name)")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sub = (subRaw ?? null) as unknown as {
    status: string;
    plan: { name: string } | { name: string }[] | null;
  } | null;
  const subPlanRaw = sub?.plan;
  const subPlan = Array.isArray(subPlanRaw) ? subPlanRaw[0] : subPlanRaw;

  // 4) Workout: bounded whole-prescription read (batched inside the loader).
  const prescription = await loadClientPrescription(coachId, clientId);

  // 5) Active weekly-program enrollment (name/dates only; the prescription
  //    covers the actual scheduled work).
  const { data: wEnrRaw } = await supabase
    .from("client_program_enrollments")
    .select("start_date, duration_weeks, status, program:coach_programs(name)")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const wEnr = (wEnrRaw ?? null) as unknown as {
    start_date: string;
    duration_weeks: number;
    status: string;
    program: { name: string } | { name: string }[] | null;
  } | null;
  const wProgram = wEnr ? (Array.isArray(wEnr.program) ? wEnr.program[0] : wEnr.program) : null;
  const workoutEnrollment: BundleEnrollment | null = wEnr
    ? {
        program_name: wProgram?.name ?? "Workout program",
        start_date: wEnr.start_date,
        duration_weeks: wEnr.duration_weeks,
        status: wEnr.status,
      }
    : null;

  // 6) Performance aggregates (existing loader — already ownership-gated and
  //    batched; PRs, 8-week volume series, sessions-last-30).
  const progressData = await loadClientProgress(coachId, clientId);
  const weeklyVolume: BundleWeeklyVolume[] = progressData?.weekly ?? [];
  const sessionsLast30 = progressData?.sessionsLast30 ?? null;
  const prs: BundlePersonalRecord[] = progressData?.prs ?? [];

  // 7) Nutrition: active enrollment + its full detail (prescribed vs current,
  //    adherence weekly series, skipped semantics) via the existing loader.
  const { data: nEnrRaw } = await supabase
    .from("client_nutrition_enrollments")
    .select("id, start_date, duration_weeks, status, program:nutrition_programs(name)")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nEnr = (nEnrRaw ?? null) as unknown as {
    id: string;
    start_date: string;
    duration_weeks: number;
    status: string;
    program: { name: string } | { name: string }[] | null;
  } | null;
  const nProgram = nEnr ? (Array.isArray(nEnr.program) ? nEnr.program[0] : nEnr.program) : null;

  const nutritionEnrollment: BundleEnrollment | null = nEnr
    ? {
        program_name: nProgram?.name ?? "Nutrition program",
        start_date: nEnr.start_date,
        duration_weeks: nEnr.duration_weeks,
        status: nEnr.status,
      }
    : null;

  let templateDays: BundleNutritionDay[] | null = null;
  let weeklyAdherence: BundleWeeklyNutritionAdapter | null = null;
  if (nEnr) {
    const detail = await loadNutritionEnrollmentDetail(coachId, clientId, nEnr.id);
    if (detail) {
      // One ISO week of the prescribed template, derived from week-1 frozen
      // assignment rows (original_* snapshots — the closest available
      // representation of the prescribed week).
      templateDays = detail.days
        .filter((d) => d.week === 1)
        .map((d) => ({
          day_of_week: d.dayOfWeek,
          notes: null, // day notes are template-level; assignment rows do not carry them
          meals: d.meals.map((m) => ({
            name: m.mealName,
            foods: m.foods.map((f) => ({
              // Prescribed (original_*) values — NOT current_* (§1.5).
              food_name: f.prescribedName,
              quantity: f.prescribedQuantity,
              serving_unit: f.servingUnit,
              calories: f.prescribed.calories,
              protein_g: f.prescribed.protein_g,
              carbs_g: f.prescribed.carbs_g,
              fat_g: f.prescribed.fat_g,
            })),
          })),
        }));
      weeklyAdherence = {
        overall: detail.overall,
        weekly: detail.weekly.map((w) => ({
          week: w.week,
          planned: w.planned,
          completed: w.completed,
          skipped: w.skipped,
          pct: w.pct,
          prescribed: {
            calories: w.prescribed.calories,
            protein_g: w.prescribed.protein_g,
            carbs_g: w.prescribed.carbs_g,
            fat_g: w.prescribed.fat_g,
          },
          current: {
            calories: w.current.calories,
            protein_g: w.current.protein_g,
            carbs_g: w.current.carbs_g,
            fat_g: w.current.fat_g,
          },
        })),
      };
    }
  }

  // 8) Recent client changes (bounded inside the loader; the free-text `note`
  //    is excluded — highest injection surface, no analytical need).
  const changeRows = await loadRecentNutritionChanges(coachId, clientId, 10);
  const clientChanges: BundleClientChange[] = changeRows.map((c) => ({
    plan_date: c.plan_date,
    meal_name: c.meal_name,
    change_type: c.change_type,
    original_food_name: c.original_food_name,
    original_quantity: c.original_quantity != null ? Number(c.original_quantity) : null,
    new_food_name: c.new_food_name,
    new_quantity: c.new_quantity != null ? Number(c.new_quantity) : null,
  }));

  // 9) Optional sensitive context — disabled by default (§1.4). When enabled
  //    by a future explicit option, only weight would be collected here and
  //    the toggle must be surfaced in the UI first.
  const measurements: BundleMeasurement[] | null = INCLUDE_OPTIONAL_CONTEXT ? [] : null;

  return {
    today,
    client: {
      display_name: profile?.full_name || profile?.name || null,
      age: profile?.age ?? null,
      gender: profile?.gender ?? null,
      height_cm: profile?.height_cm ?? null,
      weight_kg_profile: profile?.weight_kg != null ? Number(profile.weight_kg) : null,
      fitness_goal: profile?.fitness_goal ?? null,
    },
    measurements,
    goals,
    subscription: sub ? { status: sub.status, plan_name: subPlan?.name ?? null } : null,
    workout: {
      enrollment: workoutEnrollment,
      prescription,
      personal_records: prs,
      weekly_volume: weeklyVolume,
      sessions_last_30: sessionsLast30,
    },
    nutrition: {
      enrollment: nutritionEnrollment,
      template_days: templateDays,
      weekly: weeklyAdherence,
      client_changes: clientChanges,
    },
  };
}
