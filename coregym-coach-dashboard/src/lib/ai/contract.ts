// ─────────────────────────────────────────────────────────────────────────────
// AI response contract (pure, framework-free).
//
// Validates the raw Gemini text against the approved V1 structure (spec §16)
// BEFORE anything reaches the browser. Rules enforced:
//   * exact key set — unexpected fields fail validation (spec §16: "no
//     unexpected arbitrary fields");
//   * required sections present and correctly typed;
//   * overall_assessment limited to 3 sentences;
//   * issues[].evidence required (must reference payload evidence);
//   * improvements[].target restricted to the 3 allowed values;
//   * coach_action_items[].priority restricted to high | medium | low;
//   * disclaimer must match the fixed string;
//   * string-array fields reject non-string members;
//   * no scores: any numeric suitability/quality field is rejected by the
//     exact-key rule (the model cannot add one).
// No React, no fetch — unit-testable with plain objects.
// ─────────────────────────────────────────────────────────────────────────────

export const DISCLAIMER_TEXT = "Educational analysis for the coach, not medical advice.";

const SECTION_ANALYSIS_KEYS = ["summary", "observations", "potential_weaknesses", "adjustment_ideas"] as const;
const TARGETS = new Set(["workout", "nutrition", "cross_program"]);
const PRIORITIES = new Set(["high", "medium", "low"]);

export type ContractResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AiAnalysisResult = {
  overall_assessment: string;
  workout_analysis: SectionAnalysis;
  nutrition_analysis: SectionAnalysis;
  cross_program_analysis: { summary: string; conflicts: string[] };
  strengths: string[];
  issues: { title: string; detail: string; evidence: string }[];
  improvements: { title: string; detail: string; target: string }[];
  missing_information: string[];
  coach_action_items: { action: string; priority: string }[];
  program_proposal: ProgramProposal;
  disclaimer: string;
};

type SectionAnalysis = {
  summary: string;
  observations: string[];
  potential_weaknesses: string[];
  adjustment_ideas: string[];
};

// ── Program proposal (coach-actionable extension) ─────────────────────────────
//
// The model MAY propose concrete workout/nutrition programs derived from the
// analysis. Each half is independently nullable — null means "insufficient
// data to propose responsibly" (never a guess). Bounds mirror the EXISTING
// program architecture so a validated proposal converts 1:1 into templates /
// programs via the standard RPCs (parseTemplatePayload / parseNutritionPayload
// accept everything validated here):
//   * sets 1–20, reps 1–10000, weight 0–5000 kg, rest 0–86400 s
//     (workout-input.ts bounds, sets tightened to a proposal-realistic 20)
//   * ≤ 7 days, ≤ 100 exercises/day, ≤ 20 meals/day, ≤ 50 foods/meal
//     (RPC structural caps)
// The apply route re-validates with the same exported validators — the AI
// response is NEVER trusted as database truth without re-checking.
export const PROPOSAL_BOUNDS = {
  nameLen: 200,
  descLen: 2000,
  rationaleLen: 500,
  focusLen: 120,
  notesLen: 500,
  exerciseNameLen: 200,
  exerciseNotesLen: 500,
  foodNameLen: 200,
  servingUnitLen: 50,
  maxDays: 7,
  maxExercisesPerDay: 100,
  maxMealsPerDay: 20,
  maxFoodsPerMeal: 50,
  maxSets: 20,
  maxReps: 10_000,
  maxWeightKg: 5000,
  maxRestSec: 86_400,
  maxQuantity: 1_000_000,
  maxMacroValue: 1_000_000,
} as const;

export type WorkoutProposalExercise = {
  name: string;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  rest_sec: number | null;
  notes: string | null;
};

export type WorkoutProposalDay = {
  day_of_week: number; // ISO 1 = Monday .. 7 = Sunday
  focus: string | null;
  notes: string | null;
  exercises: WorkoutProposalExercise[];
};

export type WorkoutProposal = {
  name: string;
  description: string | null;
  rationale: string;
  days: WorkoutProposalDay[];
};

export type NutritionProposalFood = {
  name: string;
  quantity: number;
  serving_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type NutritionProposalMeal = {
  name: string;
  foods: NutritionProposalFood[];
};

export type NutritionProposalDay = {
  day_of_week: number; // ISO 1 = Monday .. 7 = Sunday
  notes: string | null;
  meals: NutritionProposalMeal[];
};

export type NutritionProposal = {
  name: string;
  description: string | null;
  rationale: string;
  days: NutritionProposalDay[];
};

export type ProgramProposal = {
  workout: WorkoutProposal | null;
  nutrition: NutritionProposal | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function fail(error: string): ContractResult<never> {
  return { ok: false, error };
}

function validateSection(value: unknown, name: string): ContractResult<SectionAnalysis> {
  if (!isPlainObject(value)) return fail(`${name} must be an object`);
  const keys = Object.keys(value);
  if (keys.length !== SECTION_ANALYSIS_KEYS.length || !SECTION_ANALYSIS_KEYS.every((k) => keys.includes(k))) {
    return fail(`${name} must contain exactly the keys ${SECTION_ANALYSIS_KEYS.join(", ")}`);
  }
  for (const k of SECTION_ANALYSIS_KEYS) {
    if (k === "summary") {
      if (typeof value.summary !== "string" || value.summary.trim() === "") return fail(`${name}.summary must be a non-empty string`);
    } else if (!isStringArray(value[k])) {
      return fail(`${name}.${k} must be an array of strings`);
    }
  }
  return { ok: true, value: value as SectionAnalysis };
}

// Validates an unknown parsed value against the contract.
export function validateAnalysisResult(input: unknown): ContractResult<AiAnalysisResult> {
  if (!isPlainObject(input)) return fail("Response must be a JSON object");

  const requiredKeys = [
    "overall_assessment",
    "workout_analysis",
    "nutrition_analysis",
    "cross_program_analysis",
    "strengths",
    "issues",
    "improvements",
    "missing_information",
    "coach_action_items",
    "program_proposal",
    "disclaimer",
  ];
  const keys = Object.keys(input);
  for (const k of requiredKeys) {
    if (!keys.includes(k)) return fail(`Missing required field: ${k}`);
  }
  // §16: no unexpected arbitrary fields. Unknown keys fail closed.
  for (const k of keys) {
    if (!requiredKeys.includes(k)) return fail(`Unexpected field: ${k}`);
  }

  // overall_assessment — string, ≤ 3 sentences (§16).
  if (typeof input.overall_assessment !== "string" || input.overall_assessment.trim() === "") {
    return fail("overall_assessment must be a non-empty string");
  }
  const sentences = input.overall_assessment.trim().split(/[.!?]+\s|[.!?]+$/).filter((s) => s.trim() !== "");
  if (sentences.length > 3) return fail("overall_assessment must be at most 3 sentences");

  const workout = validateSection(input.workout_analysis, "workout_analysis");
  if (!workout.ok) return workout;
  const nutrition = validateSection(input.nutrition_analysis, "nutrition_analysis");
  if (!nutrition.ok) return nutrition;

  if (!isPlainObject(input.cross_program_analysis)) return fail("cross_program_analysis must be an object");
  const cpaKeys = Object.keys(input.cross_program_analysis);
  if (cpaKeys.length !== 2 || !cpaKeys.includes("summary") || !cpaKeys.includes("conflicts")) {
    return fail("cross_program_analysis must contain exactly summary and conflicts");
  }
  if (typeof input.cross_program_analysis.summary !== "string" || input.cross_program_analysis.summary.trim() === "") {
    return fail("cross_program_analysis.summary must be a non-empty string");
  }
  if (!isStringArray(input.cross_program_analysis.conflicts)) return fail("cross_program_analysis.conflicts must be an array of strings");

  if (!isStringArray(input.strengths)) return fail("strengths must be an array of strings");
  if (!isStringArray(input.missing_information)) return fail("missing_information must be an array of strings");

  // issues[]
  if (!Array.isArray(input.issues)) return fail("issues must be an array");
  for (const [i, raw] of input.issues.entries()) {
    if (!isPlainObject(raw)) return fail(`issues[${i}] must be an object`);
    const iKeys = Object.keys(raw);
    if (iKeys.length !== 3 || !iKeys.includes("title") || !iKeys.includes("detail") || !iKeys.includes("evidence")) {
      return fail(`issues[${i}] must contain exactly title, detail, evidence`);
    }
    for (const k of ["title", "detail", "evidence"] as const) {
      if (typeof raw[k] !== "string" || (raw[k] as string).trim() === "") return fail(`issues[${i}].${k} must be a non-empty string`);
    }
  }

  // improvements[]
  if (!Array.isArray(input.improvements)) return fail("improvements must be an array");
  for (const [i, raw] of input.improvements.entries()) {
    if (!isPlainObject(raw)) return fail(`improvements[${i}] must be an object`);
    const iKeys = Object.keys(raw);
    if (iKeys.length !== 3 || !iKeys.includes("title") || !iKeys.includes("detail") || !iKeys.includes("target")) {
      return fail(`improvements[${i}] must contain exactly title, detail, target`);
    }
    if (typeof raw.title !== "string" || raw.title.trim() === "") return fail(`improvements[${i}].title must be a non-empty string`);
    if (typeof raw.detail !== "string" || raw.detail.trim() === "") return fail(`improvements[${i}].detail must be a non-empty string`);
    if (typeof raw.target !== "string" || !TARGETS.has(raw.target)) {
      return fail(`improvements[${i}].target must be one of workout | nutrition | cross_program`);
    }
  }

  // coach_action_items[]
  if (!Array.isArray(input.coach_action_items)) return fail("coach_action_items must be an array");
  for (const [i, raw] of input.coach_action_items.entries()) {
    if (!isPlainObject(raw)) return fail(`coach_action_items[${i}] must be an object`);
    const iKeys = Object.keys(raw);
    if (iKeys.length !== 2 || !iKeys.includes("action") || !iKeys.includes("priority")) {
      return fail(`coach_action_items[${i}] must contain exactly action and priority`);
    }
    if (typeof raw.action !== "string" || raw.action.trim() === "") return fail(`coach_action_items[${i}].action must be a non-empty string`);
    if (typeof raw.priority !== "string" || !PRIORITIES.has(raw.priority)) {
      return fail(`coach_action_items[${i}].priority must be one of high | medium | low`);
    }
  }

  // program_proposal — required key; each half independently nullable (§1:
  // null = insufficient data, never a guess).
  const proposal = validateProgramProposal(input.program_proposal);
  if (!proposal.ok) return proposal;

  if (input.disclaimer !== DISCLAIMER_TEXT) return fail("disclaimer must match the fixed contract text");

  return {
    ok: true,
    value: {
      overall_assessment: input.overall_assessment,
      workout_analysis: workout.value,
      nutrition_analysis: nutrition.value,
      cross_program_analysis: {
        summary: input.cross_program_analysis.summary,
        conflicts: input.cross_program_analysis.conflicts,
      },
      strengths: input.strengths,
      issues: input.issues as { title: string; detail: string; evidence: string }[],
      improvements: input.improvements as { title: string; detail: string; target: string }[],
      missing_information: input.missing_information,
      coach_action_items: input.coach_action_items as { action: string; priority: string }[],
      program_proposal: proposal.value,
      disclaimer: input.disclaimer,
    },
  };
}

// ── Proposal validators (exported — the apply route re-validates with the
//    exact same functions, so the AI output is never trusted as DB truth) ─────

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Optional bounded integer: null / undefined → null; otherwise an in-range int.
function optInt(v: unknown, min: number, max: number, label: string): ContractResult<number | null> {
  if (v == null) return { ok: true, value: null };
  if (!isInt(v) || v < min || v > max) return fail(`${label} must be an integer between ${min} and ${max} or null`);
  return { ok: true, value: v };
}

// Optional bounded number: null / undefined → null; otherwise finite & in range.
function optNum(v: unknown, min: number, max: number, label: string): ContractResult<number | null> {
  if (v == null) return { ok: true, value: null };
  if (!isFiniteNumber(v) || v < min || v > max) return fail(`${label} must be a number between ${min} and ${max} or null`);
  return { ok: true, value: v };
}

// Optional string: null / "" / whitespace-only → null; otherwise a bounded,
// trimmed string. The model is told to use null — "" is normalized rather
// than failed so harmless empty strings do not burn the one repair retry.
function optString(v: unknown, maxLen: number, label: string): ContractResult<string | null> {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${label} must be a string or null`);
  const s = v.trim();
  if (s === "") return { ok: true, value: null };
  if (s.length > maxLen) return fail(`${label} must be ${maxLen} characters or fewer`);
  return { ok: true, value: s };
}

function reqString(v: unknown, maxLen: number, label: string): ContractResult<string> {
  if (typeof v !== "string" || v.trim() === "") return fail(`${label} must be a non-empty string`);
  const s = v.trim();
  if (s.length > maxLen) return fail(`${label} must be ${maxLen} characters or fewer`);
  return { ok: true, value: s };
}

const B = PROPOSAL_BOUNDS;

export function validateWorkoutProposal(input: unknown): ContractResult<WorkoutProposal> {
  if (!isPlainObject(input)) return fail("workout proposal must be an object");
  const keys = Object.keys(input);
  if (keys.length !== 4 || !["name", "description", "rationale", "days"].every((k) => keys.includes(k))) {
    return fail("workout proposal must contain exactly name, description, rationale, days");
  }

  const name = reqString(input.name, B.nameLen, "workout proposal.name");
  if (!name.ok) return name;
  const description = optString(input.description, B.descLen, "workout proposal.description");
  if (!description.ok) return description;
  const rationale = reqString(input.rationale, B.rationaleLen, "workout proposal.rationale");
  if (!rationale.ok) return rationale;

  if (!Array.isArray(input.days) || input.days.length === 0) {
    return fail("workout proposal.days must be a non-empty array");
  }
  if (input.days.length > B.maxDays) return fail(`workout proposal.days must have at most ${B.maxDays} days`);

  const seenDays = new Set<number>();
  const days: WorkoutProposalDay[] = [];
  for (const [di, rawDay] of input.days.entries()) {
    const label = `workout proposal day ${di + 1}`;
    if (!isPlainObject(rawDay)) return fail(`${label} must be an object`);
    const dayKeys = Object.keys(rawDay);
    if (dayKeys.length !== 4 || !["day_of_week", "focus", "notes", "exercises"].every((k) => dayKeys.includes(k))) {
      return fail(`${label} must contain exactly day_of_week, focus, notes, exercises`);
    }
    if (!isInt(rawDay.day_of_week) || rawDay.day_of_week < 1 || rawDay.day_of_week > 7) {
      return fail(`${label}.day_of_week must be an integer 1 (Monday) .. 7 (Sunday)`);
    }
    if (seenDays.has(rawDay.day_of_week)) return fail(`${label}: each weekday can only appear once`);
    seenDays.add(rawDay.day_of_week);

    const focus = optString(rawDay.focus, B.focusLen, `${label}.focus`);
    if (!focus.ok) return focus;
    const notes = optString(rawDay.notes, B.notesLen, `${label}.notes`);
    if (!notes.ok) return notes;

    if (!Array.isArray(rawDay.exercises) || rawDay.exercises.length === 0) {
      return fail(`${label}.exercises must be a non-empty array`);
    }
    if (rawDay.exercises.length > B.maxExercisesPerDay) {
      return fail(`${label}.exercises must have at most ${B.maxExercisesPerDay} entries`);
    }

    const exercises: WorkoutProposalExercise[] = [];
    for (const [ei, rawEx] of rawDay.exercises.entries()) {
      const exLabel = `${label}, exercise ${ei + 1}`;
      if (!isPlainObject(rawEx)) return fail(`${exLabel} must be an object`);
      const exKeys = Object.keys(rawEx);
      if (exKeys.length !== 6 || !["name", "sets", "reps", "weight_kg", "rest_sec", "notes"].every((k) => exKeys.includes(k))) {
        return fail(`${exLabel} must contain exactly name, sets, reps, weight_kg, rest_sec, notes`);
      }
      const exName = reqString(rawEx.name, B.exerciseNameLen, `${exLabel}.name`);
      if (!exName.ok) return exName;
      if (!isInt(rawEx.sets) || rawEx.sets < 1 || rawEx.sets > B.maxSets) {
        return fail(`${exLabel}.sets must be an integer between 1 and ${B.maxSets}`);
      }
      const reps = optInt(rawEx.reps, 1, B.maxReps, `${exLabel}.reps`);
      if (!reps.ok) return reps;
      const weightKg = optNum(rawEx.weight_kg, 0, B.maxWeightKg, `${exLabel}.weight_kg`);
      if (!weightKg.ok) return weightKg;
      const restSec = optInt(rawEx.rest_sec, 0, B.maxRestSec, `${exLabel}.rest_sec`);
      if (!restSec.ok) return restSec;
      const exNotes = optString(rawEx.notes, B.exerciseNotesLen, `${exLabel}.notes`);
      if (!exNotes.ok) return exNotes;

      exercises.push({
        name: exName.value,
        sets: rawEx.sets,
        reps: reps.value,
        weight_kg: weightKg.value,
        rest_sec: restSec.value,
        notes: exNotes.value,
      });
    }

    days.push({ day_of_week: rawDay.day_of_week, focus: focus.value, notes: notes.value, exercises });
  }

  return { ok: true, value: { name: name.value, description: description.value, rationale: rationale.value, days } };
}

export function validateNutritionProposal(input: unknown): ContractResult<NutritionProposal> {
  if (!isPlainObject(input)) return fail("nutrition proposal must be an object");
  const keys = Object.keys(input);
  if (keys.length !== 4 || !["name", "description", "rationale", "days"].every((k) => keys.includes(k))) {
    return fail("nutrition proposal must contain exactly name, description, rationale, days");
  }

  const name = reqString(input.name, B.nameLen, "nutrition proposal.name");
  if (!name.ok) return name;
  const description = optString(input.description, B.descLen, "nutrition proposal.description");
  if (!description.ok) return description;
  const rationale = reqString(input.rationale, B.rationaleLen, "nutrition proposal.rationale");
  if (!rationale.ok) return rationale;

  if (!Array.isArray(input.days) || input.days.length === 0) {
    return fail("nutrition proposal.days must be a non-empty array");
  }
  if (input.days.length > B.maxDays) return fail(`nutrition proposal.days must have at most ${B.maxDays} days`);

  const seenDays = new Set<number>();
  const days: NutritionProposalDay[] = [];
  for (const [di, rawDay] of input.days.entries()) {
    const label = `nutrition proposal day ${di + 1}`;
    if (!isPlainObject(rawDay)) return fail(`${label} must be an object`);
    const dayKeys = Object.keys(rawDay);
    if (dayKeys.length !== 3 || !["day_of_week", "notes", "meals"].every((k) => dayKeys.includes(k))) {
      return fail(`${label} must contain exactly day_of_week, notes, meals`);
    }
    if (!isInt(rawDay.day_of_week) || rawDay.day_of_week < 1 || rawDay.day_of_week > 7) {
      return fail(`${label}.day_of_week must be an integer 1 (Monday) .. 7 (Sunday)`);
    }
    if (seenDays.has(rawDay.day_of_week)) return fail(`${label}: each weekday can only appear once`);
    seenDays.add(rawDay.day_of_week);

    const notes = optString(rawDay.notes, B.notesLen, `${label}.notes`);
    if (!notes.ok) return notes;

    if (!Array.isArray(rawDay.meals) || rawDay.meals.length === 0) {
      return fail(`${label}.meals must be a non-empty array`);
    }
    if (rawDay.meals.length > B.maxMealsPerDay) {
      return fail(`${label}.meals must have at most ${B.maxMealsPerDay} entries`);
    }

    const meals: NutritionProposalMeal[] = [];
    for (const [mi, rawMeal] of rawDay.meals.entries()) {
      const mealLabel = `${label}, meal ${mi + 1}`;
      if (!isPlainObject(rawMeal)) return fail(`${mealLabel} must be an object`);
      const mealKeys = Object.keys(rawMeal);
      if (mealKeys.length !== 2 || !["name", "foods"].every((k) => mealKeys.includes(k))) {
        return fail(`${mealLabel} must contain exactly name and foods`);
      }
      const mealName = reqString(rawMeal.name, 120, `${mealLabel}.name`);
      if (!mealName.ok) return mealName;

      if (!Array.isArray(rawMeal.foods) || rawMeal.foods.length === 0) {
        return fail(`${mealLabel}.foods must be a non-empty array`);
      }
      if (rawMeal.foods.length > B.maxFoodsPerMeal) {
        return fail(`${mealLabel}.foods must have at most ${B.maxFoodsPerMeal} entries`);
      }

      const foods: NutritionProposalFood[] = [];
      for (const [fi, rawFood] of rawMeal.foods.entries()) {
        const foodLabel = `${mealLabel}, food ${fi + 1}`;
        if (!isPlainObject(rawFood)) return fail(`${foodLabel} must be an object`);
        const foodKeys = Object.keys(rawFood);
        if (
          foodKeys.length !== 7 ||
          !["name", "quantity", "serving_unit", "calories", "protein_g", "carbs_g", "fat_g"].every((k) =>
            foodKeys.includes(k)
          )
        ) {
          return fail(`${foodLabel} must contain exactly name, quantity, serving_unit, calories, protein_g, carbs_g, fat_g`);
        }
        const foodName = reqString(rawFood.name, B.foodNameLen, `${foodLabel}.name`);
        if (!foodName.ok) return foodName;
        if (!isFiniteNumber(rawFood.quantity) || rawFood.quantity <= 0 || rawFood.quantity > B.maxQuantity) {
          return fail(`${foodLabel}.quantity must be a number greater than 0`);
        }
        const servingUnit = optString(rawFood.serving_unit, B.servingUnitLen, `${foodLabel}.serving_unit`);
        if (!servingUnit.ok) return servingUnit;
        const macros: Record<string, number | null> = {};
        for (const m of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
          const v: unknown = rawFood[m];
          if (v != null && (!isFiniteNumber(v) || v < 0 || v > B.maxMacroValue)) {
            return fail(`${foodLabel}.${m} must be a number between 0 and ${B.maxMacroValue} or null`);
          }
          macros[m] = v == null ? null : v;
        }

        foods.push({
          name: foodName.value,
          quantity: rawFood.quantity,
          serving_unit: servingUnit.value,
          calories: macros.calories ?? null,
          protein_g: macros.protein_g ?? null,
          carbs_g: macros.carbs_g ?? null,
          fat_g: macros.fat_g ?? null,
        });
      }

      meals.push({ name: mealName.value, foods });
    }

    days.push({ day_of_week: rawDay.day_of_week, notes: notes.value, meals });
  }

  return { ok: true, value: { name: name.value, description: description.value, rationale: rationale.value, days } };
}

export function validateProgramProposal(input: unknown): ContractResult<ProgramProposal> {
  if (!isPlainObject(input)) return fail("program_proposal must be an object");
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("workout") || !keys.includes("nutrition")) {
    return fail("program_proposal must contain exactly workout and nutrition");
  }
  const workout = input.workout == null ? { ok: true as const, value: null } : validateWorkoutProposal(input.workout);
  if (!workout.ok) return workout;
  const nutrition =
    input.nutrition == null ? { ok: true as const, value: null } : validateNutritionProposal(input.nutrition);
  if (!nutrition.ok) return nutrition;
  return { ok: true, value: { workout: workout.value, nutrition: nutrition.value } };
}
