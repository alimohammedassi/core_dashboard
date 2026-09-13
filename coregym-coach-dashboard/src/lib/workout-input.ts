// Shared validation for template create/update payloads (spec §104).
// Kept framework-free so both API routes and future server actions reuse it.

export type ParsedExercise = {
  exercise_name: string;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_sec: number | null;
  notes: string | null;
  order_index: number;
};

export type ParsedTemplate = {
  name: string;
  target_muscles: string[];
  notes: string | null;
  exercises: ParsedExercise[];
};

export type ParseResult = { ok: true; data: ParsedTemplate } | { ok: false; error: string };

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseTemplatePayload(body: unknown): ParseResult {
  if (body == null || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  if (!name) return { ok: false, error: "Template name is required" };

  const muscles = Array.isArray(b.target_muscles)
    ? b.target_muscles.map((m) => String(m).trim()).filter(Boolean)
    : [];

  const notes = b.notes == null || String(b.notes).trim() === "" ? null : String(b.notes).trim();

  if (!Array.isArray(b.exercises) || b.exercises.length === 0) {
    return { ok: false, error: "Add at least one exercise" };
  }

  const exercises: ParsedExercise[] = [];
  for (const [i, raw] of (b.exercises as unknown[]).entries()) {
    if (raw == null || typeof raw !== "object") return { ok: false, error: `Exercise ${i + 1} is invalid` };
    const e = raw as Record<string, unknown>;

    const exerciseName = String(e.exercise_name ?? "").trim();
    if (!exerciseName) return { ok: false, error: `Exercise ${i + 1}: name is required` };

    const targetSets = toIntOrNull(e.target_sets);
    if (targetSets == null || targetSets <= 0) {
      return { ok: false, error: `Exercise ${i + 1}: target sets must be greater than 0` };
    }

    const targetReps = toIntOrNull(e.target_reps);
    if (targetReps != null && targetReps <= 0) {
      return { ok: false, error: `Exercise ${i + 1}: target reps must be positive` };
    }

    const targetWeightKg = toNumOrNull(e.target_weight_kg);
    if (targetWeightKg != null && targetWeightKg < 0) {
      return { ok: false, error: `Exercise ${i + 1}: target weight cannot be negative` };
    }

    const restSec = toIntOrNull(e.rest_sec);
    if (restSec != null && restSec < 0) {
      return { ok: false, error: `Exercise ${i + 1}: rest cannot be negative` };
    }

    exercises.push({
      exercise_name: exerciseName,
      target_sets: targetSets,
      target_reps: targetReps,
      target_weight_kg: targetWeightKg,
      rest_sec: restSec,
      notes: e.notes == null || String(e.notes).trim() === "" ? null : String(e.notes).trim(),
      order_index: i,
    });
  }

  return { ok: true, data: { name, target_muscles: muscles, notes, exercises } };
}
