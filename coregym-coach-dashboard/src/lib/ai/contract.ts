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
  disclaimer: string;
};

type SectionAnalysis = {
  summary: string;
  observations: string[];
  potential_weaknesses: string[];
  adjustment_ideas: string[];
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
      disclaimer: input.disclaimer,
    },
  };
}
