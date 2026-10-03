import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ActiveClient } from "@/lib/workouts";

// ── Nutrition program library ─────────────────────────────────────────────

export type NutritionProgramFood = {
  id: string;
  food_id: string;
  quantity: number;
  order_index: number;
  foodName: string | null;
  serving_unit: string | null;
  serving_size: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type NutritionProgramMeal = {
  id: string;
  name: string;
  order_index: number;
  foods: NutritionProgramFood[];
};

export type NutritionProgramDay = {
  id: string;
  day_of_week: number; // ISO 1 = Monday .. 7 = Sunday
  notes: string | null;
  meals: NutritionProgramMeal[];
};

export type NutritionProgram = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  days: NutritionProgramDay[];
};

// Server-rendered library read. Returns [] when the migration has not been
// applied yet or RLS denies — the page renders the empty state.
// P-11: the unpaged loadNutritionPrograms was removed — no page referenced it
// (every caller uses the bounded loadNutritionProgramsPage below).

// P3: paged library read — same rows as the removed unpaged loader, bounded by
// range() with an exact total for the pager.
export async function loadNutritionProgramsPage(
  coachId: string,
  from: number,
  to: number
): Promise<{ programs: NutritionProgram[]; total: number }> {
  const supabase = await createClient();
  const select = `
      id, name, description, is_active, updated_at,
      days:nutrition_program_days(
        id, day_of_week, notes,
        meals:nutrition_program_meals(
          id, name, order_index,
          foods:nutrition_program_foods(
            id, food_id, quantity, order_index,
            food:foods(id, name, serving_unit, serving_size, calories, protein_g, carbs_g, fat_g)
          )
        )
      )
      `;
  const [{ count }, { data, error }] = await Promise.all([
    supabase.from("nutrition_programs").select("id", { count: "exact", head: true }).eq("coach_id", coachId),
    supabase
      .from("nutrition_programs")
      .select(select)
      .eq("coach_id", coachId)
      .order("updated_at", { ascending: false })
      .range(from, to),
  ]);
  if (error) return { programs: [], total: count ?? 0 };
  return { programs: mapNutritionProgramRows((data ?? []) as unknown as Record<string, unknown>[]), total: count ?? 0 };
}

function mapNutritionProgramRows(rows: Record<string, unknown>[]): NutritionProgram[] {
  return rows.map((raw) => ({
    id: raw.id as string,
    name: raw.name as string,
    description: (raw.description as string | null) ?? null,
    is_active: raw.is_active as boolean,
    updated_at: raw.updated_at as string,
    days: (((raw.days ?? []) as unknown as Record<string, unknown>[]) ?? [])
      .map((d) => ({
        id: d.id as string,
        day_of_week: d.day_of_week as number,
        notes: (d.notes as string | null) ?? null,
        meals: (((d.meals ?? []) as unknown as Record<string, unknown>[]) ?? [])
          .map((m) => ({
            id: m.id as string,
            name: m.name as string,
            order_index: (m.order_index as number) ?? 0,
            foods: (((m.foods ?? []) as unknown as Record<string, unknown>[]) ?? [])
              .map((f) => {
                const foodRaw = f.food as unknown;
                const food = (Array.isArray(foodRaw) ? foodRaw[0] : foodRaw) as Record<string, unknown> | null;
                return {
                  id: f.id as string,
                  food_id: f.food_id as string,
                  quantity: Number(f.quantity),
                  order_index: (f.order_index as number) ?? 0,
                  foodName: (food?.name as string | null) ?? null,
                  serving_unit: (food?.serving_unit as string | null) ?? null,
                  serving_size: food?.serving_size != null ? Number(food.serving_size) : null,
                  calories: food?.calories != null ? Number(food.calories) : null,
                  protein_g: food?.protein_g != null ? Number(food.protein_g) : null,
                  carbs_g: food?.carbs_g != null ? Number(food.carbs_g) : null,
                  fat_g: food?.fat_g != null ? Number(food.fat_g) : null,
                };
              })
              .sort((a, b) => a.order_index - b.order_index),
          }))
          .sort((a, b) => a.order_index - b.order_index),
      }))
      .sort((a, b) => a.day_of_week - b.day_of_week),
  }));
}

// ── Food search (server-side, paginated — never load the library to browser)
export type FoodSearchItem = {
  id: string;
  name: string;
  name_ar: string | null;
  category: string | null;
  serving_size: number | null;
  serving_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export async function searchFoods(query: string, page: number): Promise<FoodSearchItem[]> {
  const supabase = await createClient();
  const q = query.trim();
  const perPage = 20;
  const from = Math.max(0, page) * perPage;
  let req = supabase
    .from("foods")
    .select("id, name, name_ar, category, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g")
    .order("name")
    .range(from, from + perPage - 1);
  if (q.length > 0) req = req.or(`name.ilike.%${q}%,name_ar.ilike.%${q}%`);
  const { data, error } = await req;
  if (error) return [];
  return (data ?? []) as unknown as FoodSearchItem[];
}

// ── Enrollments ────────────────────────────────────────────────────────────

export type NutritionEnrollment = {
  id: string;
  program_id: string;
  program_name: string;
  start_date: string;
  duration_weeks: number;
  status: "active" | "paused" | "cancelled" | "completed";
  client_id: string;
  adherence: { planned: number; completed: number; skipped: number; pct: number | null };
};

export async function loadClientNutritionEnrollments(
  coachId: string,
  clientId: string
): Promise<NutritionEnrollment[]> {
  const svc = await createServiceClient();
  // Ownership gate: enrollment must belong to this coach AND this client.
  const { data, error } = await svc
    .from("client_nutrition_enrollments")
    .select("id, program_id, client_id, start_date, duration_weeks, status, program:nutrition_programs(name)")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("start_date", { ascending: false });
  if (error) return [];

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // Single batched adherence read (no per-enrollment N+1).
  const { data: meals } = await svc
    .from("nutrition_assignments")
    .select("enrollment_id, status, scheduled_date")
    .in(
      "enrollment_id",
      rows.map((r) => r.id as string)
    )
    .lte("scheduled_date", today)
    .limit(5000);
  const byEnrollment = new Map<string, { status: string; scheduled_date: string }[]>();
  for (const m of (meals ?? []) as unknown as {
    enrollment_id: string;
    status: string;
    scheduled_date: string;
  }[]) {
    const list = byEnrollment.get(m.enrollment_id) ?? [];
    list.push(m);
    byEnrollment.set(m.enrollment_id, list);
  }

  return rows.map((raw) => {
    const p = raw.program as unknown;
    const program = (Array.isArray(p) ? p[0] : p) as { name: string } | null;
    const list = (byEnrollment.get(raw.id as string) ?? []).filter((m) => m.scheduled_date <= today);
    const planned = list.length;
    const completed = list.filter((m) => m.status === "completed").length;
    const skipped = list.filter((m) => m.status === "skipped").length;
    return {
      id: raw.id as string,
      program_id: raw.program_id as string,
      program_name: program?.name ?? "Nutrition program",
      start_date: raw.start_date as string,
      duration_weeks: raw.duration_weeks as number,
      status: raw.status as NutritionEnrollment["status"],
      client_id: raw.client_id as string,
      adherence: { planned, completed, skipped, pct: planned === 0 ? null : Math.round((completed / planned) * 100) },
    };
  });
}

// Today's prescribed meals for one client (coach view on subscriber page).
export type TodayMeal = {
  assignmentId: string;
  meal_name: string;
  status: string;
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  foods: {
    food_name: string;
    prescribed_quantity: number;
    serving_unit: string;
    current_quantity: number | null;
    current_food_name: string | null;
    change_type: string | null;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
};

export async function loadTodayNutrition(
  coachId: string,
  clientId: string,
  dateISO: string
): Promise<TodayMeal[]> {
  const svc = await createServiceClient();
  const { data: assignments } = await svc
    .from("nutrition_assignments")
    .select("id, meal_name, status, order_index")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("scheduled_date", dateISO)
    .order("order_index");
  const rows = (assignments ?? []) as unknown as {
    id: string;
    meal_name: string;
    status: string;
    order_index: number;
  }[];
  if (rows.length === 0) return [];

  const { data: foods } = await svc
    .from("nutrition_assignment_foods")
    .select(
      "assignment_id, food_name, serving_unit, original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g, current_quantity, current_calories, current_protein_g, current_carbs_g, current_fat_g, current_food_id, change_type"
    )
    .in(
      "assignment_id",
      rows.map((r) => r.id)
    )
    .order("order_index");
  const foodRows = (foods ?? []) as unknown as Record<string, unknown>[];
  const byAssignment = new Map<string, Record<string, unknown>[]>();
  for (const f of foodRows) {
    const k = f.assignment_id as string;
    const list = byAssignment.get(k) ?? [];
    list.push(f);
    byAssignment.set(k, list);
  }

  // Resolve substituted food names (current_food_id → foods.name) in one
  // batched read. Without this the UI can only show the frozen original.
  const subIds = [
    ...new Set(
      foodRows
        .filter((f) => f.change_type != null && f.current_food_id != null)
        .map((f) => f.current_food_id as string)
    ),
  ];
  const subNames = new Map<string, string>();
  if (subIds.length > 0) {
    const { data: subFoods } = await svc.from("foods").select("id, name").in("id", subIds);
    for (const s of (subFoods ?? []) as unknown as { id: string; name: string }[]) {
      subNames.set(s.id, s.name);
    }
  }

  return rows.map((a) => {
    const items = (byAssignment.get(a.id) ?? []).map((f) => {
      const changed = f.change_type != null;
      const currentId = f.current_food_id as string | null;
      return {
        food_name: f.food_name as string,
        prescribed_quantity: Number(f.original_quantity),
        serving_unit: f.serving_unit as string,
        current_quantity: f.current_quantity != null ? Number(f.current_quantity) : null,
        current_food_name:
          changed && currentId ? (subNames.get(currentId) ?? "Substituted food") : null,
        change_type: (f.change_type as string | null) ?? null,
        calories: Number(changed && f.current_calories != null ? f.current_calories : f.original_calories),
        protein_g: Number(changed && f.current_protein_g != null ? f.current_protein_g : f.original_protein_g),
        carbs_g: Number(changed && f.current_carbs_g != null ? f.current_carbs_g : f.original_carbs_g),
        fat_g: Number(changed && f.current_fat_g != null ? f.current_fat_g : f.original_fat_g),
      };
    });
    const totals = items.reduce(
      (t, i) => ({
        calories: t.calories + i.calories,
        protein_g: t.protein_g + i.protein_g,
        carbs_g: t.carbs_g + i.carbs_g,
        fat_g: t.fat_g + i.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    return {
      assignmentId: a.id,
      meal_name: a.meal_name,
      status: a.status,
      totals: {
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g * 10) / 10,
        carbs_g: Math.round(totals.carbs_g * 10) / 10,
        fat_g: Math.round(totals.fat_g * 10) / 10,
      },
      foods: items,
    };
  });
}

export type NutritionChange = {
  id: string;
  plan_date: string | null;
  meal_name: string | null;
  change_type: string;
  original_food_name: string | null;
  original_quantity: number | null;
  new_food_name: string | null;
  new_quantity: number | null;
  created_at: string;
};

export async function loadRecentNutritionChanges(
  coachId: string,
  clientId: string,
  limit = 20
): Promise<NutritionChange[]> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("nutrition_change_log")
    .select(
      "id, plan_date, meal_name, change_type, original_food_name, original_quantity, new_food_name, new_quantity, created_at"
    )
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as NutritionChange[];
}

export type { ActiveClient };

// ── Full enrollment detail (detailed program view + analytics) ────────────
// One enrollment, every day, every meal, every food: frozen prescribed vs
// client-modified current, resolved names, per-meal/per-day/per-week totals.
// Reads go through the service role only after the enrollment ownership
// check (coach + client match), mirroring loadEnrollmentProgress.

import { isoWeekday } from "@/lib/program-dates";
import { sumCurrent, sumPrescribed, type MacroSet } from "@/lib/nutrition-math";

export type DetailFood = {
  id: string;
  order_index: number;
  prescribedName: string;
  prescribedQuantity: number;
  servingUnit: string;
  prescribed: MacroSet;
  currentName: string;
  currentQuantity: number;
  current: MacroSet;
  changed: boolean;
  changeType: string | null;
};

export type DetailMeal = {
  assignmentId: string;
  mealName: string;
  orderIndex: number;
  status: "assigned" | "completed" | "skipped";
  foods: DetailFood[];
  prescribed: MacroSet;
  current: MacroSet; // zeros when skipped (visible plan, nothing consumed)
};

export type DetailDay = {
  date: string;
  dayOfWeek: number; // ISO 1 = Monday .. 7 = Sunday
  week: number;
  status: "upcoming" | "today" | "past";
  meals: DetailMeal[];
  prescribed: MacroSet;
  current: MacroSet;
};

export type WeeklyNutrition = {
  week: number;
  planned: number;
  completed: number;
  skipped: number;
  pct: number | null; // elapsed-only adherence; null when nothing elapsed
  prescribed: MacroSet;
  current: MacroSet;
};

export type NutritionEnrollmentDetail = {
  enrollment: {
    id: string;
    program_id: string;
    program_name: string;
    start_date: string;
    duration_weeks: number;
    status: "active" | "paused" | "cancelled" | "completed";
    client_id: string;
  };
  days: DetailDay[];
  weekly: WeeklyNutrition[];
  overall: { planned: number; completed: number; skipped: number; pct: number | null };
  futureAssignedCount: number;
};

const ZERO: MacroSet = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

export async function loadNutritionEnrollmentDetail(
  coachId: string,
  clientId: string,
  enrollmentId: string
): Promise<NutritionEnrollmentDetail | null> {
  const svc = await createServiceClient();

  // F-03: query failure → throw (error boundary), never a fake 404 via null.
  const { data: enrollmentRaw, error: enrollmentErr } = await svc
    .from("client_nutrition_enrollments")
    .select("id, program_id, client_id, start_date, duration_weeks, status")
    .eq("id", enrollmentId)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (enrollmentErr) throw new Error(`nutrition enrollment load failed: ${enrollmentErr.message}`);
  if (!enrollmentRaw) return null;
  const e = enrollmentRaw as unknown as {
    id: string;
    program_id: string;
    client_id: string;
    start_date: string;
    duration_weeks: number;
    status: NutritionEnrollmentDetail["enrollment"]["status"];
  };

  const [{ data: programRaw }, { data: assignmentsRaw }] = await Promise.all([
    svc.from("nutrition_programs").select("name").eq("id", e.program_id).maybeSingle(),
    svc
      .from("nutrition_assignments")
      .select("id, meal_name, order_index, status, scheduled_date, week_number")
      .eq("enrollment_id", e.id)
      .order("scheduled_date")
      .order("order_index")
      .limit(5000),
  ]);
  const program = programRaw as unknown as { name: string } | null;
  const assignments = (assignmentsRaw ?? []) as unknown as {
    id: string;
    meal_name: string;
    order_index: number;
    status: "assigned" | "completed" | "skipped";
    scheduled_date: string;
    week_number: number | null;
  }[];

  // Foods are read in assignment-id chunks: a single .in() with ~800 UUIDs
  // exceeds the PostgREST URL cap and fails the whole read (observed live on
  // the overview gauge). Long enrollments materialize thousands of meals, so
  // chunk at 200 and merge; per-assignment grouping below is order-agnostic
  // beyond each chunk's own order_index sort.
  let foodRows: Record<string, unknown>[] = [];
  for (let i = 0; i < assignments.length && foodRows.length < 10000; i += 200) {
    const { data: foodsRaw, error: foodsErr } = await svc
      .from("nutrition_assignment_foods")
      .select(
        "id, assignment_id, food_name, serving_unit, original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g, current_food_id, current_quantity, current_calories, current_protein_g, current_carbs_g, current_fat_g, change_type, order_index"
      )
      .in(
        "assignment_id",
        assignments.slice(i, i + 200).map((a) => a.id)
      )
      .order("order_index")
      .limit(10000);
    if (foodsErr) break; // degrade to "no food detail" exactly as the old single-read failure did
    foodRows = foodRows.concat((foodsRaw ?? []) as unknown as Record<string, unknown>[]);
  }
  const byAssignment = new Map<string, Record<string, unknown>[]>();
  for (const f of foodRows) {
    const k = f.assignment_id as string;
    const list = byAssignment.get(k) ?? [];
    list.push(f);
    byAssignment.set(k, list);
  }

  const subIds = [
    ...new Set(
      foodRows
        .filter((f) => f.change_type != null && f.current_food_id != null)
        .map((f) => f.current_food_id as string)
    ),
  ];
  const subNames = new Map<string, string>();
  if (subIds.length > 0) {
    const { data: subFoods } = await svc.from("foods").select("id, name").in("id", subIds);
    for (const s of (subFoods ?? []) as unknown as { id: string; name: string }[]) {
      subNames.set(s.id, s.name);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byDate.get(a.scheduled_date) ?? [];
    list.push(a);
    byDate.set(a.scheduled_date, list);
  }

  const days: DetailDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const meals: DetailMeal[] = rows.map((a) => {
        const foods: DetailFood[] = (byAssignment.get(a.id) ?? []).map((f, i) => {
          const changed = f.change_type != null;
          const currentId = f.current_food_id as string | null;
          const prescribed: MacroSet = {
            calories: num(f.original_calories),
            protein_g: num(f.original_protein_g),
            carbs_g: num(f.original_carbs_g),
            fat_g: num(f.original_fat_g),
          };
          const current: MacroSet = changed
            ? {
                calories: num(f.current_calories),
                protein_g: num(f.current_protein_g),
                carbs_g: num(f.current_carbs_g),
                fat_g: num(f.current_fat_g),
              }
            : prescribed;
          return {
            id: f.id as string,
            order_index: (f.order_index as number) ?? i,
            prescribedName: f.food_name as string,
            prescribedQuantity: num(f.original_quantity),
            servingUnit: (f.serving_unit as string) ?? "",
            prescribed,
            currentName:
              changed && currentId ? (subNames.get(currentId) ?? "Substituted food") : (f.food_name as string),
            currentQuantity: changed && f.current_quantity != null ? num(f.current_quantity) : num(f.original_quantity),
            current,
            changed,
            changeType: (f.change_type as string | null) ?? null,
          };
        });
        const prescribed = sumPrescribed(foods.map((x) => ({ prescribed: x.prescribed })));
        const current =
          a.status === "skipped" ? { ...ZERO } : sumPrescribed(foods.map((x) => ({ prescribed: x.current })));
        return {
          assignmentId: a.id,
          mealName: a.meal_name,
          orderIndex: a.order_index,
          status: a.status,
          foods,
          prescribed,
          current,
        };
      });
      const prescribed = sumPrescribed(meals.map((m) => ({ prescribed: m.prescribed })));
      const current = sumCurrent(meals.map((m) => ({ status: m.status, current: m.current })));
      const week = rows[0]?.week_number ?? 1;
      return {
        date,
        dayOfWeek: isoWeekday(date),
        week,
        status: date === today ? "today" : date < today ? "past" : "upcoming",
        meals,
        prescribed,
        current,
      };
    });

  // Weekly series: adherence over elapsed rows; kcal/macros over the week.
  const weekly: WeeklyNutrition[] = Array.from({ length: e.duration_weeks }, (_, i) => {
    const week = i + 1;
    const wdays = days.filter((d) => d.week === week);
    const wmeals = wdays.flatMap((d) => d.meals.map((m) => ({ ...m, date: d.date })));
    const elapsed = wmeals.filter((m) => m.date <= today);
    const planned = elapsed.length;
    const completed = elapsed.filter((m) => m.status === "completed").length;
    const skipped = elapsed.filter((m) => m.status === "skipped").length;
    return {
      week,
      planned,
      completed,
      skipped,
      pct: planned === 0 ? null : Math.round((completed / planned) * 100),
      prescribed: sumPrescribed(wdays.map((d) => ({ prescribed: d.prescribed }))),
      current: sumCurrent(
        wdays.flatMap((d) => d.meals.map((m) => ({ status: m.status, current: m.current })))
      ),
    };
  });

  const allElapsed = assignments.filter((a) => a.scheduled_date <= today);
  const planned = allElapsed.length;
  const completed = allElapsed.filter((a) => a.status === "completed").length;
  const skipped = allElapsed.filter((a) => a.status === "skipped").length;

  return {
    enrollment: {
      id: e.id,
      program_id: e.program_id,
      program_name: program?.name ?? "Nutrition program",
      start_date: e.start_date,
      duration_weeks: e.duration_weeks,
      status: e.status,
      client_id: e.client_id,
    },
    days,
    weekly,
    overall: { planned, completed, skipped, pct: planned === 0 ? null : Math.round((completed / planned) * 100) },
    futureAssignedCount: assignments.filter((a) => a.status === "assigned" && a.scheduled_date > today).length,
  };
}
