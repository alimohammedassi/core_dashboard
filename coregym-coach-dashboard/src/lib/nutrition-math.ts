// Pure nutrition math — framework-free so the builder UI, API routes and
// unit tests all share one implementation. Mirrors the SQL scaling basis in
// supabase/nutrition_programs_migration.sql exactly:
//
//   scaled = base × quantity / serving_size
//
// where quantity is expressed in the food's own serving_unit. Values are
// NEVER assumed per-100g: serving_size varies per food (100 g, 1 piece,
// 500 ml, 1 portion, …). Rounding happens ONCE at the end:
// kcal → integer, grams → 1 decimal.

export type MacroSet = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type FoodBasis = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size: number | null;
};

// Guard: NULL/0 serving_size must never divide by zero (no live row hits
// this today, but the code must not depend on that).
export function basisOrOne(servingSize: number | null | undefined): number {
  if (servingSize == null || !Number.isFinite(servingSize) || servingSize <= 0) return 1;
  return servingSize;
}

// Scale one macro value from its library basis to a prescribed quantity.
export function scaleValue(base: number, quantity: number, servingSize: number | null | undefined): number {
  const basis = basisOrOne(servingSize);
  const b = Number(base) || 0;
  const q = Number(quantity) || 0;
  return (b * q) / basis;
}

// Scale a full food row. Returns UNROUNDED values — round once at display.
export function scaleFood(basis: FoodBasis, quantity: number): MacroSet {
  return {
    calories: scaleValue(basis.calories, quantity, basis.serving_size),
    protein_g: scaleValue(basis.protein_g, quantity, basis.serving_size),
    carbs_g: scaleValue(basis.carbs_g, quantity, basis.serving_size),
    fat_g: scaleValue(basis.fat_g, quantity, basis.serving_size),
  };
}

// Display rounding: kcal → integer, grams → 1 decimal.
export function roundMacros(m: MacroSet): MacroSet {
  return {
    calories: Math.round(m.calories),
    protein_g: Math.round(m.protein_g * 10) / 10,
    carbs_g: Math.round(m.carbs_g * 10) / 10,
    fat_g: Math.round(m.fat_g * 10) / 10,
  };
}

export function sumMacros(list: MacroSet[]): MacroSet {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const m of list) {
    total.calories += m.calories || 0;
    total.protein_g += m.protein_g || 0;
    total.carbs_g += m.carbs_g || 0;
    total.fat_g += m.fat_g || 0;
  }
  return total;
}

// ── Prescription merge ────────────────────────────────────────────────────
// Mirrors the SQL + API read rule: effective = current when a client change
// exists, otherwise the frozen original. original_* is never overwritten —
// repeated changes only move current_* forward, history keeps every step.

export type PrescribedFood = {
  original_quantity: number;
  original_calories: number;
  original_protein_g: number;
  original_carbs_g: number;
  original_fat_g: number;
  current_quantity: number | null;
  current_calories: number | null;
  current_protein_g: number | null;
  current_carbs_g: number | null;
  current_fat_g: number | null;
  change_type: string | null;
};

export function effectiveFoodValues(f: PrescribedFood): MacroSet & { quantity: number } {
  const changed = f.change_type != null;
  return {
    quantity: changed && f.current_quantity != null ? f.current_quantity : f.original_quantity,
    calories: changed && f.current_calories != null ? f.current_calories : f.original_calories,
    protein_g: changed && f.current_protein_g != null ? f.current_protein_g : f.original_protein_g,
    carbs_g: changed && f.current_carbs_g != null ? f.current_carbs_g : f.original_carbs_g,
    fat_g: changed && f.current_fat_g != null ? f.current_fat_g : f.original_fat_g,
  };
}

// ── Regeneration eligibility (§10) ─────────────────────────────────────────
// A meal row may be deleted/regenerated ONLY when it is still assigned,
// scheduled in the future, and has no client change. Every other case is
// preserved. Case table: A future+assigned+pristine → regenerate; B future+
// completed → keep; C future+skipped → keep; D future+changed → keep;
// E past (any state) → keep; F past+modified → keep.

export function isRegenerable(
  row: { status: MealStatus; scheduled_date: string; change_type: string | null },
  todayISO: string
): boolean {
  return row.status === "assigned" && row.scheduled_date > todayISO && row.change_type == null;
}

// ── Client change lock (§8) ────────────────────────────────────────────────
// Meals older than 7 days reject changes (stale history stays immutable).
// Product choice — change only with product approval.

export function isChangeLocked(scheduledDate: string, todayISO: string): boolean {
  const ms = Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${scheduledDate}T00:00:00Z`);
  return Math.round(ms / 86400000) > 7;
}

// ── Day/meal rollups with the skipped rule ─────────────────────────────────
// Prescribed covers every planned meal; "current" covers only non-skipped
// meals — a skipped meal stays visible in the plan but contributes nothing
// to what the client actually had.

export function sumPrescribed(meals: { prescribed: MacroSet }[]): MacroSet {
  return roundMacros(sumMacros(meals.map((m) => m.prescribed)));
}

export function sumCurrent(meals: { status: MealStatus; current: MacroSet }[]): MacroSet {
  return roundMacros(sumMacros(meals.filter((m) => m.status !== "skipped").map((m) => m.current)));
}
// ── Adherence ─────────────────────────────────────────────────────────────
// Meal adherence = completed meals / planned meals on elapsed dates × 100.
// Rules: future meals never count; skipped counts as not adherent; a changed
// (substituted/re-quantified) meal that is completed counts as adherent —
// changing food is compliant behavior tracked separately in the change log.

export type MealStatus = "assigned" | "completed" | "skipped";

export function mealAdherence(
  meals: { status: MealStatus; scheduled_date: string }[],
  todayISO: string
): { planned: number; completed: number; skipped: number; pct: number | null } {
  const elapsed = meals.filter((m) => m.scheduled_date <= todayISO);
  const planned = elapsed.length;
  const completed = elapsed.filter((m) => m.status === "completed").length;
  const skipped = elapsed.filter((m) => m.status === "skipped").length;
  return { planned, completed, skipped, pct: planned === 0 ? null : Math.round((completed / planned) * 100) };
}
