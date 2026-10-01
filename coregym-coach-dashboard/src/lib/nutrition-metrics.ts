// Coach-wide nutrition library metrics for the KPI row on /dashboard/nutrition.
// Every read here is a head-count or a hard-limited slice reduced in JS —
// no unbounded scans (mirrors the plans/overview aggregate patterns; the
// idx_cne_coach and idx_ncl_coach indexes back the enrollment/swap counts).

import { createClient } from "@/lib/supabase/server";

export type NutritionLibraryMetrics = {
  /** Coach-wide 7-day meal adherence from scheduled assignments.
   * Null when nothing elapsed in the window (not zero — nothing to divide by). */
  adherence: { planned: number; completed: number; pct: number } | null;
  /** Active enrollments + distinct clients among them (coach-scoped). */
  activeAssignments: number;
  assignmentClients: number;
  /** Substitution + quantity change-log rows in the last 7 days. */
  swaps7d: number;
};

const BOUNDED_ROWS = 2000; // roster-style slice cap for the JS-side distinct count
const BOUNDED_ADHERENCE = 5000; // matches the existing 5000-cap assignment reads

export async function loadNutritionLibraryMetrics(coachId: string): Promise<NutritionLibraryMetrics> {
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  // Inclusive 7-day calendar window: [today-6, today].
  const weekStartISO = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const weekAgoStamp = new Date(Date.now() - 7 * 86400000).toISOString();

  const [enrollRes, adherenceRes, swapsRes] = await Promise.all([
    // Active assignments (idx_cne_coach) — bounded slice, reduced in JS for
    // the distinct-client count. Errors resolve to zero rows (honest "—").
    supabase
      .from("client_nutrition_enrollments")
      .select("client_id")
      .eq("coach_id", coachId)
      .eq("status", "active")
      .limit(BOUNDED_ROWS),
    // Elapsed meals only: scheduled_date is bounded to the 7-day window, so
    // every row counted here has already elapsed by construction.
    supabase
      .from("nutrition_assignments")
      .select("status")
      .eq("coach_id", coachId)
      .gte("scheduled_date", weekStartISO)
      .lte("scheduled_date", todayISO)
      .limit(BOUNDED_ADHERENCE),
    // Swap log head-count on idx_ncl_coach (coach_id, created_at desc).
    // "Swaps" = substitutions + quantity changes (the two client-initiated
    // edits the footer advertises); removals/additions are excluded.
    supabase
      .from("nutrition_change_log")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .in("change_type", ["substitution", "quantity"])
      .gte("created_at", weekAgoStamp),
  ]);

  const clients = new Set<string>();
  for (const row of (enrollRes.data ?? []) as unknown as { client_id: string }[]) {
    clients.add(row.client_id);
  }

  const mealRows = (adherenceRes.data ?? []) as unknown as { status: string }[];
  const planned = mealRows.length;
  const completed = mealRows.filter((r) => r.status === "completed").length;

  return {
    adherence:
      planned === 0
        ? null
        : { planned, completed, pct: Math.min(100, Math.round((completed / planned) * 100)) },
    activeAssignments: (enrollRes.data ?? []).length,
    assignmentClients: clients.size,
    swaps7d: swapsRes.count ?? 0,
  };
}
