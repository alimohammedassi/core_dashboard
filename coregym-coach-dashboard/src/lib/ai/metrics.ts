// ─────────────────────────────────────────────────────────────────────────────
// Deterministic analysis metrics (pure, framework-free).
//
// Everything the UI visualizes as a NUMBER is computed here from the exact
// same bounded payload the AI saw (src/lib/ai/payload.ts) — never from the
// AI response. This keeps the contract's "no scores" rule intact: the model
// contributes qualitative text only; every count, percentage and series on
// screen is deterministic application code.
//
// No React, no Supabase, no fetch — unit-testable with plain payloads.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiAnalysisPayload } from "./payload.ts";

export type AiAnalysisMetrics = {
  workout: {
    /** Everything not upcoming: completed + started + missed + skipped. */
    elapsed: number;
    completed: number;
    started: number;
    missed: number;
    skipped: number;
    upcoming: number;
    /** completed / elapsed as an integer percent; null when nothing elapsed. */
    completion_pct: number | null;
    sessions_last_30: number | null;
    weekly_volume: { week_start: string; volume: number; sessions: number }[];
  };
  nutrition: {
    overall: { planned: number; completed: number; skipped: number; pct: number | null };
    weekly: { week: number; planned: number; completed: number; skipped: number; pct: number | null }[];
    /** Mean of the prescribed daily totals across the template week; null when empty. */
    avg_daily: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  };
  weight: { latest_kg: number | null; trend_kg: number | null };
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildAnalysisMetrics(payload: AiAnalysisPayload): AiAnalysisMetrics {
  // ── Workout: the payload's status_summary is already computed deterministically
  // by the builder (completed/started/skipped, missed = assigned & past, upcoming
  // = assigned & today-or-later). Only the derived percentages are added here.
  const s = payload.workout_program.status_summary;
  const elapsed = s.completed + s.started + s.missed + s.skipped;

  const weeklyVolume = payload.workout_program.weekly_volume_kg.map((w) => ({
    week_start: w.week_start,
    volume: w.volume,
    sessions: w.sessions,
  }));

  // ── Nutrition adherence: overall + bounded weekly series straight from the
  // payload (adherence = plan-completion, never consumption — spec §1.5).
  const nutritionWeekly = payload.nutrition_adherence.weekly.map((w) => ({
    week: w.week,
    planned: w.planned,
    completed: w.completed,
    skipped: w.skipped,
    pct: w.pct,
  }));

  // ── Prescribed daily macros: mean across the template week (0 days → null).
  const totals = payload.nutrition_program.daily_totals_prescribed;
  const avgDaily =
    totals.length > 0
      ? {
          calories: Math.round(totals.reduce((sum, d) => sum + d.calories, 0) / totals.length),
          protein_g: round1(totals.reduce((sum, d) => sum + d.protein_g, 0) / totals.length),
          carbs_g: round1(totals.reduce((sum, d) => sum + d.carbs_g, 0) / totals.length),
          fat_g: round1(totals.reduce((sum, d) => sum + d.fat_g, 0) / totals.length),
        }
      : null;

  return {
    workout: {
      elapsed,
      completed: s.completed,
      started: s.started,
      missed: s.missed,
      skipped: s.skipped,
      upcoming: s.upcoming,
      completion_pct: elapsed > 0 ? Math.round((s.completed / elapsed) * 100) : null,
      sessions_last_30: payload.workout_program.sessions_last_30,
      weekly_volume: weeklyVolume,
    },
    nutrition: {
      overall: { ...payload.nutrition_adherence.overall },
      weekly: nutritionWeekly,
      avg_daily: avgDaily,
    },
    weight: {
      latest_kg: payload.client.weight_kg_latest,
      trend_kg: payload.client.weight_trend_kg,
    },
  };
}
