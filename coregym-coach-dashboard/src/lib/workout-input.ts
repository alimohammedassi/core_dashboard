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
  // W2 caps mirror the nutrition parser (names 200, notes 2000, bounded
  // counts/magnitudes) so oversized payloads fail fast instead of slow.
  if (name.length > 200) return { ok: false, error: "Template name must be 200 characters or fewer" };

  const muscles = Array.isArray(b.target_muscles)
    ? b.target_muscles.map((m) => String(m).trim()).filter(Boolean).slice(0, 20)
    : [];

  const notes = b.notes == null || String(b.notes).trim() === "" ? null : String(b.notes).trim();
  if (notes != null && notes.length > 2000) {
    return { ok: false, error: "Notes must be 2000 characters or fewer" };
  }

  if (!Array.isArray(b.exercises) || b.exercises.length === 0) {
    return { ok: false, error: "Add at least one exercise" };
  }
  if (b.exercises.length > 100) {
    return { ok: false, error: "A template holds at most 100 exercises" };
  }

  const exercises: ParsedExercise[] = [];
  for (const [i, raw] of (b.exercises as unknown[]).entries()) {
    if (raw == null || typeof raw !== "object") return { ok: false, error: `Exercise ${i + 1} is invalid` };
    const e = raw as Record<string, unknown>;

    const exerciseName = String(e.exercise_name ?? "").trim();
    if (!exerciseName) return { ok: false, error: `Exercise ${i + 1}: name is required` };
    if (exerciseName.length > 200) {
      return { ok: false, error: `Exercise ${i + 1}: name must be 200 characters or fewer` };
    }

    const targetSets = toIntOrNull(e.target_sets);
    if (targetSets == null || targetSets <= 0 || targetSets > 100) {
      return { ok: false, error: `Exercise ${i + 1}: target sets must be between 1 and 100` };
    }

    const targetReps = toIntOrNull(e.target_reps);
    if (targetReps != null && (targetReps <= 0 || targetReps > 10000)) {
      return { ok: false, error: `Exercise ${i + 1}: target reps must be between 1 and 10000` };
    }

    const targetWeightKg = toNumOrNull(e.target_weight_kg);
    if (targetWeightKg != null && (targetWeightKg < 0 || targetWeightKg > 5000)) {
      return { ok: false, error: `Exercise ${i + 1}: target weight must be between 0 and 5000 kg` };
    }

    const restSec = toIntOrNull(e.rest_sec);
    if (restSec != null && (restSec < 0 || restSec > 86400)) {
      return { ok: false, error: `Exercise ${i + 1}: rest must be between 0 and 86400 seconds` };
    }

    const exerciseNotes =
      e.notes == null || String(e.notes).trim() === "" ? null : String(e.notes).trim().slice(0, 2000);

    exercises.push({
      exercise_name: exerciseName,
      target_sets: targetSets,
      target_reps: targetReps,
      target_weight_kg: targetWeightKg,
      rest_sec: restSec,
      notes: exerciseNotes,
      order_index: i,
    });
  }

  return { ok: true, data: { name, target_muscles: muscles, notes, exercises } };
}
