// ─────────────────────────────────────────────────────────────────────────────
// AI analysis payload builder (pure, framework-free).
//
// Contract with the rest of the system:
//   * INPUT  — an AiDataBundle assembled by src/lib/ai/collect.ts from
//              coach-scoped loaders (ownership verified BEFORE collection).
//   * OUTPUT — the normalized JSON object sent to Gemini (src/lib/ai/gemini.ts).
//
// Hard rules enforced here (spec §4.4, §7, §13, §25):
//   * MINIMIZATION: no email, no avatar URL, no auth UUIDs, no coach UUIDs,
//     no enrollment/assignment ids, no chat messages, no raw workout sets.
//     Every field below is an explicit allowlist entry — nothing is spread
//     from raw rows into the payload.
//   * BOUNDS: every repeated structure is capped (constants below).
//   * SEMANTICS: prescribed nutrition vs completed/skipped meals are distinct
//     fields; the AI must never conflate them (spec §1.5).
//   * MISSING: null stays null — never replaced with guessed values (§25).
//   * No React, no Supabase, no fetch — unit-testable with plain objects.
// ─────────────────────────────────────────────────────────────────────────────

// ── Payload bounds (spec §13; mirrors DB/parser caps where they exist) ──────
export const AI_BOUNDS = {
  programDays: 7, // structural max (unique(program_id, day_of_week))
  exercisesPerTemplate: 100, // workout-input.ts cap
  mealsPerDay: 20, // RPC + parser cap
  foodsPerMeal: 50, // RPC + parser cap
  weeklyScheduleDays: 7, // one ISO week of the nutrition template
  assignments: 120, // workload window (matches loadClientPrescription default)
  recentPerformance: 10,
  personalRecords: 10,
  weeklyVolumeWeeks: 12,
  weeklyAdherenceWeeks: 12,
  clientChanges: 10,
  nutritionWeeklyTotals: 8, // daily_totals_prescribed rows (one ISO week max is 7)
  textLen: 300, // free-text fields truncated to bound the payload
  // GLOBAL volume budget for exercise entries across the whole prescription.
  // Per-list caps alone (120 assignments × 100 exercises) could still produce
  // a megabyte-scale payload; this budget bounds the total. When exceeded,
  // the OLDEST assignments lose their exercise detail (recent work matters
  // most for analysis) and data_notes.prescription_truncated is set so the
  // omission is disclosed to the model and the coach — never silent (§25).
  totalExerciseEntries: 900,
  // GLOBAL volume budget for food entries across the whole prescribed week.
  // Same flaw as per-list exercise caps: 7 days × 20 meals × 50 foods is
  // legal per-list but ~770 KB in total. Newest-day-first budget, degrading
  // the lowest-priority (highest order_index) foods; disclosed via
  // data_notes.prescription_truncated (§25).
  totalFoodEntries: 500,
  // Hard defensive cap on the serialized JSON (the builder caps every list
  // AND applies global budgets; this guards against pathological future
  // field additions). ~256 KB ≈ 64k tokens — far below provider limits.
  payloadMaxBytes: 256_000,
} as const;

function clip(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > AI_BOUNDS.textLen ? `${s.slice(0, AI_BOUNDS.textLen)}…` : s;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function first(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

// ── Input bundle (assembled in collect.ts from coach-scoped loaders) ─────────

export type BundleClientProfile = {
  display_name: string | null; // full_name → name → null (never email)
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg_profile: number | null;
  fitness_goal: string | null;
};

export type BundleMeasurement = { measured_date: string; weight_kg: number | null };

export type BundleGoals = {
  daily_calories: number | null;
  weekly_workouts: number | null;
  target_weight_kg: number | null;
};

export type BundleExercise = {
  exercise_name: string;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_sec: number | null;
  notes: string | null;
  order_index: number;
};

export type BundleAssignment = {
  scheduled_date: string;
  week_number: number | null;
  status: "assigned" | "started" | "completed" | "skipped";
  template_name: string | null;
  target_muscles: string[];
  template_notes: string | null;
  exercises: BundleExercise[];
  session: { session_date: string | null; duration_min: number | null } | null;
};

export type BundlePrescription = {
  assignments: BundleAssignment[];
  window: { since: string; until: string };
  truncated: boolean;
};

export type BundleEnrollment = {
  program_name: string;
  start_date: string;
  duration_weeks: number;
  status: string;
};

export type BundleNutritionMeal = { name: string; foods: BundleNutritionFood[] };
export type BundleNutritionFood = {
  food_name: string | null;
  quantity: number;
  serving_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};
export type BundleNutritionDay = { day_of_week: number; notes: string | null; meals: BundleNutritionMeal[] };

export type BundleNutritionWeekly = {
  week: number;
  planned: number;
  completed: number;
  skipped: number;
  pct: number | null;
  prescribed: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  current: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

export type BundleClientChange = {
  plan_date: string | null;
  meal_name: string | null;
  change_type: string;
  original_food_name: string | null;
  original_quantity: number | null;
  new_food_name: string | null;
  new_quantity: number | null;
};

export type BundleWeeklyVolume = { weekStart: string; volume: number; sessions: number };

export type BundlePersonalRecord = {
  exercise_name: string;
  max_weight: number | null;
  reps: number | null;
  achieved_date: string | null;
};

export type AiDataBundle = {
  today: string; // ISO date anchor (deterministic input, not runtime clock)
  client: BundleClientProfile;
  measurements: BundleMeasurement[] | null; // null = not collected (optional context off)
  goals: BundleGoals | null; // null = not available (e.g. policy/RLS gap)
  subscription: { status: string; plan_name: string | null } | null;
  workout: {
    enrollment: BundleEnrollment | null; // active weekly-program enrollment
    prescription: BundlePrescription | null; // bounded assignment window
    personal_records: BundlePersonalRecord[] | null;
    weekly_volume: BundleWeeklyVolume[] | null; // 8-week series from loadClientProgress
    sessions_last_30: number | null;
  };
  nutrition: {
    enrollment: BundleEnrollment | null;
    template_days: BundleNutritionDay[] | null; // one ISO week of the template
    weekly: BundleWeeklyNutritionAdapter | null; // adherence + prescribed/current per week
    client_changes: BundleClientChange[] | null;
  };
};

// The nutrition detail loader returns richer weekly rows; this adapter type is
// exactly what the payload needs (structural subset — collect.ts maps it).
export type BundleWeeklyNutritionAdapter = {
  overall: { planned: number; completed: number; skipped: number; pct: number | null };
  weekly: BundleNutritionWeekly[];
};

// ── Output payload (the exact normalized structure sent to Gemini) ───────────

export type AiPayloadPerformanceEntry = {
  date: string;
  template_name: string | null;
  status: string;
  target_sets_total: number;
  logged_session: boolean;
  duration_min: number | null;
  target_exercise_count: number;
};

export type AiPayloadExercise = {
  exercise_name: string;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_sec: number | null;
  notes: string | null;
  order_index: number;
};

export type AiPayloadWorkoutDay = {
  date: string;
  week_number: number | null;
  status: string;
  template_name: string | null;
  target_muscles: string[];
  template_notes: string | null;
  exercises: AiPayloadExercise[];
  session_logged: boolean;
  session_duration_min: number | null;
};

export type AiPayloadNutritionMeal = {
  name: string;
  foods: {
    food_name: string;
    quantity: number;
    serving_unit: string | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  }[];
};

export type AiAnalysisPayload = {
  generated_at: string;
  client: {
    display_name: string;
    age: number | null;
    gender: string | null;
    height_cm: number | null;
    weight_kg_latest: number | null; // latest body measurement, else profile weight
    weight_trend_kg: number | null; // latest − earliest (measurements) — null when <2 logs
    fitness_goal: string | null;
    numeric_goals: {
      daily_calories: number | null;
      weekly_workouts: number | null;
      target_weight_kg: number | null;
      available: boolean; // false when the goals read was unavailable entirely
    };
  };
  subscription: { status: string; plan_name: string | null } | null;
  workout_program: {
    enrollment: {
      name: string;
      start_date: string;
      duration_weeks: number;
      current_week: number | null;
      status: string;
    } | null;
    weekly_schedule: {
      date: string;
      week_number: number | null;
      status: string;
      template: {
        name: string | null;
        target_muscles: string[]; // coach-tagged; approximate, not per-exercise certainty
        notes: string | null;
        exercises: AiPayloadExercise[];
      };
    }[];
    status_summary: {
      completed: number;
      started: number;
      skipped: number;
      missed: number; // status 'assigned' AND scheduled_date < today
      upcoming: number; // status 'assigned' AND scheduled_date >= today
    };
    recent_performance: AiPayloadPerformanceEntry[];
    personal_records: { exercise_name: string; max_weight_kg: number | null; reps: number | null; achieved_date: string | null }[];
    weekly_volume_kg: { week_start: string; volume: number; sessions: number }[];
    sessions_last_30: number | null;
    window: { since: string; until: string; truncated: boolean };
  };
  nutrition_program: {
    enrollment: {
      name: string;
      start_date: string;
      duration_weeks: number;
      current_week: number | null;
      status: string;
    } | null;
    weekly_schedule_prescribed: {
      day_of_week: number;
      notes: string | null;
      meals: AiPayloadNutritionMeal[];
    }[];
    daily_totals_prescribed: {
      day_of_week: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }[];
    // NOTE: these totals are the PRESCRIBED plan (frozen original_* snapshots),
    // never what the client consumed (spec §1.5).
  };
  nutrition_adherence: {
    overall: { planned: number; completed: number; skipped: number; pct: number | null };
    weekly: BundleNutritionWeekly[];
    client_changes_summary: {
      counts_by_type: Record<string, number>;
      recent: {
        plan_date: string | null;
        meal_name: string | null;
        change_type: string;
        original: string | null;
        replacement: string | null;
      }[];
    } | null;
  };
  data_notes: {
    measurements_included: boolean;
    prescription_truncated: boolean;
    heuristic_fields: string[]; // fields the AI must treat as approximate
  };
};

// ── Builder ───────────────────────────────────────────────────────────────────

// F-14: week math shared with the pages, aligned to the SQL convention
// (program-dates.ts is pure — this file stays framework-free and unit-testable
// under node --test, so the import is relative with an explicit extension).
import { enrollmentWeekOf } from "../program-dates.ts";

function currentWeek(startISO: string, durationWeeks: number, today: string): number | null {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(now) || now < start) return null;
  return enrollmentWeekOf(startISO, today, durationWeeks);
}

function clamp<T>(list: T[] | null | undefined, max: number): T[] {
  return (list ?? []).slice(0, max);
}

export function buildAnalysisPayload(bundle: AiDataBundle): AiAnalysisPayload {
  const today = bundle.today;

  // ── Client ─────────────────────────────────────────────────────────────────
  // Weight: prefer the latest body measurement; fall back to the profile field.
  const measurements = clamp(bundle.measurements, AI_BOUNDS.personalRecords).filter((m) => m.weight_kg != null);
  const latestMeasurement = measurements[0]?.weight_kg ?? null;
  const earliestMeasurement = measurements.length >= 2 ? measurements[measurements.length - 1].weight_kg : null;
  const weightLatest = latestMeasurement ?? bundle.client.weight_kg_profile;
  const weightTrend =
    latestMeasurement != null && earliestMeasurement != null
      ? Math.round((latestMeasurement - earliestMeasurement) * 10) / 10
      : null;

  const client: AiAnalysisPayload["client"] = {
    display_name: first(bundle.client.display_name) ?? "Client",
    age: bundle.client.age,
    gender: bundle.client.gender,
    height_cm: bundle.client.height_cm,
    weight_kg_latest: weightLatest,
    weight_trend_kg: weightTrend,
    fitness_goal: clip(bundle.client.fitness_goal),
    numeric_goals: {
      daily_calories: bundle.goals?.daily_calories ?? null,
      weekly_workouts: bundle.goals?.weekly_workouts ?? null,
      target_weight_kg: bundle.goals?.target_weight_kg ?? null,
      available: bundle.goals != null,
    },
  };

  // ── Workout ────────────────────────────────────────────────────────────────
  const assignments = clamp(bundle.workout.prescription?.assignments, AI_BOUNDS.assignments);
  const statusSummary = { completed: 0, started: 0, skipped: 0, missed: 0, upcoming: 0 };
  for (const a of assignments) {
    if (a.status === "completed") statusSummary.completed += 1;
    else if (a.status === "started") statusSummary.started += 1;
    else if (a.status === "skipped") statusSummary.skipped += 1;
    else if (a.status === "assigned") {
      if (a.scheduled_date < today) statusSummary.missed += 1;
      else statusSummary.upcoming += 1;
    }
  }

  const weeklySchedule = assignments.map((a) => ({
    date: a.scheduled_date,
    week_number: a.week_number,
    status: a.status,
    template: {
      name: a.template_name,
      target_muscles: (a.target_muscles ?? []).slice(0, 20),
      notes: clip(a.template_notes),
      exercises: clamp(a.exercises, AI_BOUNDS.exercisesPerTemplate).map((e) => ({
        exercise_name: e.exercise_name,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        target_weight_kg: e.target_weight_kg,
        rest_sec: e.rest_sec,
        notes: clip(e.notes),
        order_index: e.order_index,
      })),
    },
    session_logged: a.session != null,
    session_duration_min: a.session?.duration_min ?? null,
  }));

  // Global exercise-entry budget: newest assignments keep their detail; the
  // oldest ones degrade to names-only when the budget is exhausted. Always
  // disclosed via data_notes.prescription_truncated (§25).
  let exerciseBudget: number = AI_BOUNDS.totalExerciseEntries;
  for (let i = weeklySchedule.length - 1; i >= 0; i--) {
    const exercises = weeklySchedule[i].template.exercises;
    if (exerciseBudget >= exercises.length) {
      exerciseBudget -= exercises.length;
      continue;
    }
    if (exerciseBudget > 0) {
      // Keep the highest-order (first) exercises within the remaining budget.
      weeklySchedule[i].template.exercises = exercises.slice(0, exerciseBudget);
      exerciseBudget = 0;
    } else {
      weeklySchedule[i].template.exercises = [];
    }
  }
  const volumeTruncated = exerciseBudget < AI_BOUNDS.totalExerciseEntries;

  const recentPerformance: AiPayloadPerformanceEntry[] = assignments
    .filter((a) => a.status === "completed" || a.status === "started")
    .slice(-AI_BOUNDS.recentPerformance)
    .reverse()
    .map((a) => ({
      date: a.scheduled_date,
      template_name: a.template_name,
      status: a.status,
      target_sets_total: a.exercises.reduce((s, e) => s + (Number(e.target_sets) || 0), 0),
      logged_session: a.session != null,
      duration_min: a.session?.duration_min ?? null,
      target_exercise_count: a.exercises.length,
    }));

  const workoutEnrollment = bundle.workout.enrollment
    ? {
        name: bundle.workout.enrollment.program_name,
        start_date: bundle.workout.enrollment.start_date,
        duration_weeks: bundle.workout.enrollment.duration_weeks,
        current_week: currentWeek(bundle.workout.enrollment.start_date, bundle.workout.enrollment.duration_weeks, today),
        status: bundle.workout.enrollment.status,
      }
    : null;

  // ── Nutrition ──────────────────────────────────────────────────────────────
  const templateDays = clamp(bundle.nutrition.template_days, AI_BOUNDS.weeklyScheduleDays);
  const weeklySchedulePrescribed = templateDays.map((d) => ({
    day_of_week: d.day_of_week,
    notes: clip(d.notes),
    meals: clamp(d.meals, AI_BOUNDS.mealsPerDay).map((m) => ({
      name: m.name,
      foods: clamp(m.foods, AI_BOUNDS.foodsPerMeal).map((f) => ({
        food_name: f.food_name ?? "Food",
        quantity: num(f.quantity) ?? 0,
        serving_unit: f.serving_unit,
        calories: f.calories,
        protein_g: f.protein_g,
        carbs_g: f.carbs_g,
        fat_g: f.fat_g,
      })),
    })),
  }));

  const dailyTotals = weeklySchedulePrescribed.map((d) => {
    const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (const m of d.meals) {
      for (const f of m.foods) {
        totals.calories += f.calories ?? 0;
        totals.protein_g += f.protein_g ?? 0;
        totals.carbs_g += f.carbs_g ?? 0;
        totals.fat_g += f.fat_g ?? 0;
      }
    }
    return {
      day_of_week: d.day_of_week,
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
    };
  });

  // Global food-entry budget across the prescribed week (newest-day-first):
  // degrade lowest-priority (highest order_index within the last meals) when
  // exhausted; totals above are computed BEFORE any trimming so prescribed
  // calorie/macro totals stay accurate even when the food detail is reduced.
  let foodBudget: number = AI_BOUNDS.totalFoodEntries;
  for (let i = weeklySchedulePrescribed.length - 1; i >= 0; i--) {
    const day = weeklySchedulePrescribed[i];
    for (let j = day.meals.length - 1; j >= 0; j--) {
      const foods = day.meals[j].foods;
      if (foodBudget >= foods.length) {
        foodBudget -= foods.length;
        continue;
      }
      if (foodBudget > 0) {
        day.meals[j].foods = foods.slice(0, foodBudget);
        foodBudget = 0;
      } else {
        day.meals[j].foods = [];
      }
    }
  }
  const foodTruncated = foodBudget < AI_BOUNDS.totalFoodEntries;

  const nutritionEnrollment = bundle.nutrition.enrollment
    ? {
        name: bundle.nutrition.enrollment.program_name,
        start_date: bundle.nutrition.enrollment.start_date,
        duration_weeks: bundle.nutrition.enrollment.duration_weeks,
        current_week: currentWeek(
          bundle.nutrition.enrollment.start_date,
          bundle.nutrition.enrollment.duration_weeks,
          today
        ),
        status: bundle.nutrition.enrollment.status,
      }
    : null;

  // Client changes: counts by type + bounded recent list, labeled with the
  // original → replacement pair. change_type/source semantics come straight
  // from nutrition_assignment_foods / nutrition_change_log (§9).
  const changes = clamp(bundle.nutrition.client_changes, AI_BOUNDS.clientChanges);
  const countsByType: Record<string, number> = {};
  for (const c of bundle.nutrition.client_changes ?? []) {
    countsByType[c.change_type] = (countsByType[c.change_type] ?? 0) + 1;
  }

  return {
    generated_at: today,
    client,
    subscription: bundle.subscription,
    workout_program: {
      enrollment: workoutEnrollment,
      weekly_schedule: weeklySchedule,
      status_summary: statusSummary,
      recent_performance: recentPerformance,
      personal_records: clamp(bundle.workout.personal_records, AI_BOUNDS.personalRecords).map((p) => ({
        exercise_name: p.exercise_name,
        max_weight_kg: p.max_weight,
        reps: p.reps,
        achieved_date: p.achieved_date,
      })),
      weekly_volume_kg: clamp(bundle.workout.weekly_volume, AI_BOUNDS.weeklyVolumeWeeks).map((w) => ({
        week_start: w.weekStart,
        volume: w.volume,
        sessions: w.sessions,
      })),
      sessions_last_30: bundle.workout.sessions_last_30,
      window: {
        since: bundle.workout.prescription?.window.since ?? today,
        until: bundle.workout.prescription?.window.until ?? today,
        truncated: (bundle.workout.prescription?.truncated ?? false) || volumeTruncated || foodTruncated,
      },
    },
    nutrition_program: {
      enrollment: nutritionEnrollment,
      weekly_schedule_prescribed: weeklySchedulePrescribed,
      daily_totals_prescribed: dailyTotals.slice(0, AI_BOUNDS.nutritionWeeklyTotals),
    },
    nutrition_adherence: {
      overall: bundle.nutrition.weekly?.overall ?? { planned: 0, completed: 0, skipped: 0, pct: null },
      weekly: clamp(bundle.nutrition.weekly?.weekly, AI_BOUNDS.weeklyAdherenceWeeks),
      client_changes_summary:
        bundle.nutrition.client_changes != null
          ? {
              counts_by_type: countsByType,
              recent: changes.map((c) => ({
                plan_date: c.plan_date,
                meal_name: c.meal_name,
                change_type: c.change_type,
                original:
                  c.original_food_name != null
                    ? `${c.original_food_name}${c.original_quantity != null ? ` (${c.original_quantity})` : ""}`
                    : null,
                replacement:
                  c.new_food_name != null || c.new_quantity != null
                    ? `${c.new_food_name ?? c.original_food_name ?? "Food"}${
                        c.new_quantity != null ? ` (${c.new_quantity})` : ""
                      }`
                    : null,
              })),
            }
          : null,
    },
    data_notes: {
      measurements_included: bundle.measurements != null,
      prescription_truncated: bundle.workout.prescription?.truncated ?? false,
      // Approximate-by-construction fields: the AI must not present them as
      // certain (spec §8 muscle mapping).
      heuristic_fields: ["client.display_name", "workout_program.*.target_muscles"],
    },
  };
}

// ── Required-missing-information inference (deterministic, shared with the
//    route so the prompt and the validation agree on what was absent) ─────────

export function inferMissingInformation(payload: AiAnalysisPayload): string[] {
  const missing: string[] = [];
  if (payload.client.age == null) missing.push("Client age is not available.");
  if (payload.client.gender == null) missing.push("Client gender is not available.");
  if (payload.client.height_cm == null) missing.push("Client height is not available.");
  if (payload.client.weight_kg_latest == null) missing.push("Client body weight is not available.");
  if (!payload.client.numeric_goals.available)
    missing.push("Client numeric goals (calories, weekly workouts, target weight) are not available.");
  if (payload.client.fitness_goal == null) missing.push("Client fitness goal text is not available.");
  if (payload.workout_program.enrollment == null)
    missing.push("No active weekly workout program enrollment is assigned to this client.");
  if (payload.nutrition_program.enrollment == null)
    missing.push("No active nutrition program enrollment is assigned to this client.");
  if (payload.workout_program.weekly_schedule.length === 0)
    missing.push("No assigned workouts within the recent window — workout prescription cannot be analyzed.");
  if (payload.workout_program.recent_performance.length === 0)
    missing.push("No completed or in-progress workouts with logged sessions — performance trends are unavailable.");
  if (payload.workout_program.weekly_volume_kg.every((w) => w.volume === 0))
    missing.push("No logged training volume — volume-progression observations are not possible.");
  if (payload.nutrition_program.weekly_schedule_prescribed.length === 0)
    missing.push("No nutrition template days available — prescribed nutrition structure cannot be analyzed.");
  if (payload.nutrition_adherence.overall.planned === 0)
    missing.push("No elapsed nutrition plan days — nutrition adherence is not yet measurable.");
  // Injury/medical context does not exist in the schema — always disclose.
  missing.push("No injury, medical-condition, allergy or dietary-restriction information is available.");
  missing.push("Actual meal-level consumption cannot be directly linked to the prescribed nutrition plan; adherence is plan-completion only.");
  if (payload.data_notes.prescription_truncated)
    missing.push("The workout history window was truncated — older assignments are not included.");
  return missing;
}
