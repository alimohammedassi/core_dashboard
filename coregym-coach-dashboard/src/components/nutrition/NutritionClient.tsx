"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Apple, Copy, Pencil, Trash2, UserPlus, Plus, ArrowUp, ArrowDown, X, Search } from "lucide-react";
import type { NutritionProgram } from "@/lib/nutrition";
import type { ActiveClient } from "@/lib/workouts";
import { scaleFood, roundMacros, sumMacros, averageProgramDayMacros, type MacroSet } from "@/lib/nutrition-math";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/core/EmptyState";
import { PageHeader } from "@/components/core/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MacroGrid, MacroPill, MealChip, mealNo } from "@/components/nutrition/macro-display";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Localized weekday labels: `short` for badges/tabs, `full` for day headers. */
function useWeekdays(): { short: string; full: string }[] {
  const { t } = useI18n();
  return WEEKDAY_KEYS.map((k) => ({
    short: t(`nutrition.weekdays.${k}.short`),
    full: t(`nutrition.weekdays.${k}.full`),
  }));
}

// ── Builder state ───────────────────────────────────────────────────────────

type BuilderFood = {
  key: string;
  food_id: string;
  foodName: string;
  serving_unit: string | null;
  serving_size: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  quantity: string;
};

type BuilderMeal = { key: string; name: string; foods: BuilderFood[] };
type BuilderDay = { day_of_week: number; notes: string; meals: BuilderMeal[] };

type BuilderSeed = {
  editing: NutritionProgram | null;
  name: string;
  description: string;
  days: BuilderDay[];
};

const uid = () => Math.random().toString(36).slice(2);

function foodToBuilder(f: {
  food_id: string;
  quantity: number;
  foodName: string | null;
  serving_unit: string | null;
  serving_size: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}): BuilderFood {
  return {
    key: uid(),
    food_id: f.food_id,
    foodName: f.foodName ?? "",
    serving_unit: f.serving_unit,
    serving_size: f.serving_size,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    quantity: String(f.quantity),
  };
}

function seedForCreate(defaultMealName: string): BuilderSeed {
  return {
    editing: null,
    name: "",
    description: "",
    days: [{ day_of_week: 1, notes: "", meals: [{ key: uid(), name: defaultMealName, foods: [] }] }],
  };
}

function seedForEdit(program: NutritionProgram): BuilderSeed {
  return {
    editing: program,
    name: program.name,
    description: program.description ?? "",
    days: program.days.map((d) => ({
      day_of_week: d.day_of_week,
      notes: d.notes ?? "",
      meals: d.meals.map((m) => ({
        key: uid(),
        name: m.name,
        foods: m.foods.map(foodToBuilder),
      })),
    })),
  };
}

// ── Macro helpers ───────────────────────────────────────────────────────────

function foodMacros(f: BuilderFood): MacroSet {
  const qty = Number(f.quantity) || 0;
  if (f.calories == null || qty <= 0) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  return scaleFood(
    {
      calories: f.calories,
      protein_g: f.protein_g ?? 0,
      carbs_g: f.carbs_g ?? 0,
      fat_g: f.fat_g ?? 0,
      serving_size: f.serving_size,
    },
    qty
  );
}

function mealTotals(m: BuilderMeal): MacroSet {
  return roundMacros(sumMacros(m.foods.map(foodMacros)));
}

function dayTotals(d: BuilderDay): MacroSet {
  return roundMacros(sumMacros(d.meals.map(mealTotals)));
}

// ── Food search ─────────────────────────────────────────────────────────────

type SearchHit = {
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

function FoodPicker({
  onPick,
  onClose,
}: {
  onPick: (f: SearchHit) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? t("nutrition.picker.searchFailed"));
        setHits(body.foods ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t("nutrition.picker.searchFailed"));
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, t]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("nutrition.picker.title")}</DialogTitle>
          <DialogDescription>{t("nutrition.picker.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={t("nutrition.picker.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-8"
          />
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {loading && <p className="px-1 py-4 text-sm text-muted-foreground">{t("nutrition.picker.searching")}</p>}
          {!loading && error && <p className="px-1 py-4 text-sm text-destructive">{error}</p>}
          {!loading && !error && hits.length === 0 && (
            <p className="px-1 py-4 text-sm text-muted-foreground">{t("nutrition.picker.noResults")}</p>
          )}
          {hits.map((h, hi) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onPick(h);
                onClose();
              }}
              className={cn(
                "w-full rounded-xl border-s-2 bg-background/60 p-2 text-start transition-colors hover:bg-secondary/60",
                hi === 0 ? "border-s-primary" : "border-s-transparent"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-label-md font-semibold">{h.name}</span>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-secondary px-2 py-0.5 text-label-sm text-muted-foreground">
                  {t("nutrition.picker.serving", { size: h.serving_size ?? "—", unit: h.serving_unit ?? "" })}
                </span>
              </div>
              <MacroGrid
                className="mt-1.5"
                macros={{
                  calories: h.calories ?? 0,
                  protein_g: h.protein_g ?? 0,
                  carbs_g: h.carbs_g ?? 0,
                  fat_g: h.fat_g ?? 0,
                }}
                labels={{
                  kcal: t("nutrition.picker.kcalShort"),
                  protein: t("nutrition.picker.proteinShort"),
                  carbs: t("nutrition.picker.carbsShort"),
                  fat: t("nutrition.picker.fatShort"),
                }}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-label-sm text-faint">{h.category ?? ""}</span>
                <span className="shrink-0 text-label-sm font-semibold text-primary">
                  {t("nutrition.picker.quickInsert")}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main client ─────────────────────────────────────────────────────────────

export function NutritionClient({
  initialPrograms,
  clients,
  kpis,
}: {
  initialPrograms: NutritionProgram[];
  clients: ActiveClient[];
  /** Server-rendered metric row, rendered between the header and the grid. */
  kpis?: React.ReactNode;
}) {
  const router = useRouter();
  const { t, fmt } = useI18n();
  const weekdays = useWeekdays();
  const [programs, setPrograms] = React.useState(initialPrograms);
  const [builderSeed, setBuilderSeed] = React.useState<BuilderSeed | null>(null);
  const [builderNonce, setBuilderNonce] = React.useState(0);
  const [enrollSeed, setEnrollSeed] = React.useState<NutritionProgram | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function upsertSaved(program: NutritionProgram) {
    setPrograms((prev) => {
      const exists = prev.some((p) => p.id === program.id);
      return exists ? prev.map((p) => (p.id === program.id ? program : p)) : [program, ...prev];
    });
  }

  async function handleDelete(program: NutritionProgram) {
    if (!window.confirm(t("nutrition.confirmDelete", { name: program.name }))) return;
    setBusyId(program.id);
    try {
      const res = await fetch(`/api/nutrition-programs?id=${encodeURIComponent(program.id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("nutrition.toasts.deleteFailed"));
      setPrograms((prev) => prev.filter((p) => p.id !== program.id));
      toast.success(t("nutrition.toasts.programDeleted"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("nutrition.toasts.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(program: NutritionProgram) {
    setBusyId(program.id);
    try {
      const res = await fetch(`/api/nutrition-programs/${encodeURIComponent(program.id)}/duplicate`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("nutrition.toasts.duplicateFailed"));
      toast.success(t("nutrition.toasts.programDuplicated"));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("nutrition.toasts.duplicateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("nutrition.page.title")}
        chip={t("nutrition.page.kicker")}
        description={t("nutrition.page.subtitle")}
        actions={
          <Button
            size="lg"
            className="text-label-lg font-bold shadow-md shadow-primary/20"
            onClick={() => {
              setBuilderSeed(seedForCreate(t("nutrition.builder.defaultMeal")));
              setBuilderNonce((n) => n + 1);
            }}
          >
            <Plus className="size-4" />
            {t("nutrition.createProgram")}
          </Button>
        }
      />

      {kpis}

      {programs.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={t("nutrition.empty.title")}
          hint={t("nutrition.empty.hint")}
          action={
            <Button
              onClick={() => {
                setBuilderSeed(seedForCreate(t("nutrition.builder.defaultMeal")));
                setBuilderNonce((n) => n + 1);
              }}
            >
              {t("nutrition.createProgram")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((p) => {
            // Stitch day strip: 7 fixed slots — assigned days volt-tinted with
            // meal counts, rest slots dimmed.
            const byDay = new Map<number, number>();
            for (const d of p.days) byDay.set(d.day_of_week, d.meals.length);
            // Per-day kcal/macros truth from the already-loaded tree — no
            // extra query. Temp ids / null macros scale to zero safely.
            const avgDay = averageProgramDayMacros([p]);
            return (
              <Card key={p.id} className="flex flex-col transition-colors hover:bg-secondary/60">
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-headline-sm tracking-tight text-foreground">
                          {p.name}
                        </h3>
                        {p.is_active && (
                          <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-label-sm uppercase text-primary">
                            {t("nutrition.card.active")}
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="mt-1 line-clamp-2 text-body-sm text-faint">{p.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common.actions.edit")}
                        disabled={busyId === p.id}
                        onClick={() => {
                          setBuilderSeed(seedForEdit(p));
                          setBuilderNonce((n) => n + 1);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.duplicate")} disabled={busyId === p.id} onClick={() => handleDuplicate(p)}>
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} disabled={busyId === p.id} onClick={() => handleDelete(p)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {weekdays.map((w, i) => {
                      const meals = byDay.get(i + 1);
                      const rest = meals == null;
                      return (
                        <div
                          key={w.short}
                          title={rest ? t("nutrition.card.rest") : t("nutrition.card.mealsTitle", { n: meals })}
                          className={`rounded-md border p-1.5 text-center ${
                            rest ? "border-border/60 bg-background/40" : "border-primary/25 bg-primary/10"
                          }`}
                        >
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${rest ? "text-faint" : "text-primary"}`}>
                            {w.short}
                          </p>
                          <p className={`mt-0.5 text-[11px] font-semibold tabular-nums leading-tight ${rest ? "text-faint/70" : "text-foreground"}`}>
                            {rest ? "—" : meals}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    {avgDay != null ? (
                      <>
                        <span className="text-label-md font-semibold tabular-nums text-foreground">
                          {t("nutrition.card.kcalDay", { kcal: fmt.num(avgDay.calories) })}
                        </span>
                        <MacroPill macros={avgDay} kcal={false} className="text-label-sm" />
                      </>
                    ) : (
                      <span className="text-label-md tabular-nums text-faint">—</span>
                    )}
                  </div>

                  <Button
                    className="mt-auto w-fit px-4"
                    disabled={clients.length === 0}
                    onClick={() => setEnrollSeed(p)}
                  >
                    <UserPlus className="size-4" />
                    {clients.length === 0 ? t("nutrition.card.noSubscribers") : t("nutrition.card.assign")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {builderSeed && (
        <BuilderDialog
          key={builderNonce}
          seed={builderSeed}
          onClose={() => setBuilderSeed(null)}
          onSaved={(p) => {
            upsertSaved(p);
            setBuilderSeed(null);
            router.refresh();
          }}
        />
      )}
      {enrollSeed && (
        <EnrollDialog program={enrollSeed} clients={clients} onClose={() => setEnrollSeed(null)} />
      )}
    </div>
  );
}

// ── Builder dialog ──────────────────────────────────────────────────────────

function BuilderDialog({
  seed,
  onClose,
  onSaved,
}: {
  seed: BuilderSeed;
  onClose: () => void;
  onSaved: (p: NutritionProgram) => void;
}) {
  const [name, setName] = React.useState(seed.name);
  const [description, setDescription] = React.useState(seed.description);
  const [days, setDays] = React.useState<BuilderDay[]>(seed.days);
  const [activeDay, setActiveDay] = React.useState<number>(seed.days[0]?.day_of_week ?? 1);
  const [pickFor, setPickFor] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { t, fmt } = useI18n();
  const weekdays = useWeekdays();

  const day = days.find((d) => d.day_of_week === activeDay);

  function ensureDay(dow: number) {
    setDays((prev) => {
      if (prev.some((d) => d.day_of_week === dow)) return prev;
      return [
        ...prev,
        { day_of_week: dow, notes: "", meals: [{ key: uid(), name: t("nutrition.builder.defaultMeal"), foods: [] }] },
      ].sort((a, b) => a.day_of_week - b.day_of_week);
    });
    setActiveDay(dow);
  }

  function removeDay(dow: number) {
    setDays((prev) => prev.filter((d) => d.day_of_week !== dow));
  }

  function updateDay(dow: number, fn: (d: BuilderDay) => BuilderDay) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? fn(d) : d)));
  }

  function addMeal() {
    if (!day) return;
    updateDay(day.day_of_week, (d) => ({
      ...d,
      meals: [...d.meals, { key: uid(), name: t("nutrition.builder.numberedMeal", { n: d.meals.length + 1 }), foods: [] }],
    }));
  }

  function moveMeal(mealKey: string, dir: -1 | 1) {
    if (!day) return;
    updateDay(day.day_of_week, (d) => {
      const i = d.meals.findIndex((m) => m.key === mealKey);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.meals.length) return d;
      const meals = [...d.meals];
      [meals[i], meals[j]] = [meals[j], meals[i]];
      return { ...d, meals };
    });
  }

  function addFood(mealKey: string, hit: SearchHit) {
    if (!day) return;
    const food: BuilderFood = {
      key: uid(),
      food_id: hit.id,
      foodName: hit.name,
      serving_unit: hit.serving_unit,
      serving_size: hit.serving_size,
      calories: hit.calories,
      protein_g: hit.protein_g,
      carbs_g: hit.carbs_g,
      fat_g: hit.fat_g,
      quantity: hit.serving_size != null ? String(hit.serving_size) : "1",
    };
    updateDay(day.day_of_week, (d) => ({
      ...d,
      meals: d.meals.map((m) => (m.key === mealKey ? { ...m, foods: [...m.foods, food] } : m)),
    }));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("nutrition.toasts.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: seed.editing?.id,
        name: name.trim(),
        description: description.trim() || null,
        days: days.map((d) => ({
          day_of_week: d.day_of_week,
          notes: d.notes.trim() || null,
          meals: d.meals.map((m) => ({
            name: m.name.trim(),
            foods: m.foods.map((f) => ({ food_id: f.food_id, quantity: Number(f.quantity) || 0 })),
          })),
        })),
      };
      const res = await fetch("/api/nutrition-programs", {
        method: seed.editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("nutrition.toasts.saveFailed"));
      toast.success(seed.editing ? t("nutrition.toasts.programUpdated") : t("nutrition.toasts.programCreated"));
      // N3: render the card from the just-saved builder state (real names,
      // macros, day badges) instead of a {days:[]} stub. Row ids are
      // temporary until the refresh below reconciles them from the server —
      // the library card only reads names/counts, never these ids.
      onSaved({
        id: (body.id as string) ?? seed.editing?.id ?? "",
        name: payload.name,
        description: payload.description,
        is_active: true,
        updated_at: new Date().toISOString(),
        days: days.map((d) => ({
          id: `local-day-${d.day_of_week}`,
          day_of_week: d.day_of_week,
          notes: d.notes.trim() || null,
          meals: d.meals.map((m, mi) => ({
            id: m.key,
            name: m.name.trim(),
            order_index: mi,
            foods: m.foods.map((f, fi) => ({
              id: f.key,
              food_id: f.food_id,
              quantity: Number(f.quantity) || 0,
              order_index: fi,
              foodName: f.foodName,
              serving_unit: f.serving_unit,
              serving_size: f.serving_size,
              calories: f.calories,
              protein_g: f.protein_g,
              carbs_g: f.carbs_g,
              fat_g: f.fat_g,
            })),
          })),
        })),
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("nutrition.toasts.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const weekTotals = roundMacros(sumMacros(days.map(dayTotals)));

  // Day-macro summary bar data. The h-2 tracks show each macro's share of
  // total macro energy (protein/carbs ×4, fat ×9) — absolute values above,
  // no targets (none are stored).
  const dt = day ? dayTotals(day) : null;
  const pKcal = (dt?.protein_g ?? 0) * 4;
  const cKcal = (dt?.carbs_g ?? 0) * 4;
  const fKcal = (dt?.fat_g ?? 0) * 9;
  const macroKcal = pKcal + cKcal + fKcal;
  const dayMacroCells = dt
    ? [
        {
          key: "kcal",
          label: t("nutrition.picker.kcalShort"),
          value: fmt.num(dt.calories),
          valueClass: "text-foreground",
          fillClass: null as string | null,
          share: null as number | null,
        },
        {
          key: "protein",
          label: t("nutrition.picker.proteinShort"),
          value: fmt.num(dt.protein_g),
          valueClass: "text-mint",
          fillClass: "bg-mint",
          share: macroKcal > 0 ? pKcal / macroKcal : 0,
        },
        {
          key: "carbs",
          label: t("nutrition.picker.carbsShort"),
          value: fmt.num(dt.carbs_g),
          valueClass: "text-primary",
          fillClass: "bg-primary",
          share: macroKcal > 0 ? cKcal / macroKcal : 0,
        },
        {
          key: "fat",
          label: t("nutrition.picker.fatShort"),
          value: fmt.num(dt.fat_g),
          valueClass: "text-faint",
          fillClass: "bg-faint",
          share: macroKcal > 0 ? fKcal / macroKcal : 0,
        },
      ]
    : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{seed.editing ? t("nutrition.builder.titleEdit") : t("nutrition.builder.titleCreate")}</DialogTitle>
          <DialogDescription>
            {t("nutrition.builder.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="np-name">{t("common.table.name")}</Label>
            <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("nutrition.builder.namePlaceholder")} />
          </div>
          <div>
            <Label htmlFor="np-desc">{t("nutrition.builder.notes")}</Label>
            <Textarea id="np-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("nutrition.builder.notesPlaceholder")} rows={2} />
          </div>
        </div>

        {/* Weekday tabs: kcal sub-label from dayTotals; "+" invites adding the day. */}
        <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
          {weekdays.map((w, i) => {
            const dow = i + 1;
            const d = days.find((x) => x.day_of_week === dow);
            const active = activeDay === dow;
            return (
              <button
                key={w.short}
                type="button"
                aria-pressed={active}
                onClick={() => (d ? setActiveDay(dow) : ensureDay(dow))}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-lg px-3.5 py-2 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : d
                      ? "bg-secondary text-secondary-foreground hover:bg-accent"
                      : "border border-dashed border-border text-faint hover:bg-muted"
                )}
              >
                <span className="text-label-md">{w.short}</span>
                <span className="text-[11px] tabular-nums opacity-70">
                  {d ? t("nutrition.builder.dayKcal", { kcal: fmt.num(dayTotals(d).calories) }) : "+"}
                </span>
              </button>
            );
          })}
        </div>

        {day ? (
          <div className="space-y-3 rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-label-lg font-semibold text-foreground">{weekdays[day.day_of_week - 1].full}</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={addMeal}>
                  <Plus className="size-3 ms-1" /> {t("nutrition.builder.newMeal")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeDay(day.day_of_week)}>
                  {t("nutrition.builder.restDay")}
                </Button>
              </div>
            </div>

            {/* Day macro summary — absolute values only (no targets stored). */}
            <div className="rounded-xl bg-background p-3">
              <p className="text-label-sm uppercase tracking-wider text-faint">{t("nutrition.builder.dayMacrosTitle")}</p>
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                {dayMacroCells.map((c) => (
                  <div key={c.key}>
                    <p className="text-label-sm uppercase tracking-wider text-faint">{c.label}</p>
                    <p className={cn("mt-0.5 text-body-md font-semibold tabular-nums", c.valueClass)}>{c.value}</p>
                    {c.fillClass && c.share != null && c.share > 0 ? (
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                        <div className={cn("h-full rounded-full", c.fillClass)} style={{ width: `${Math.round(c.share * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {day.meals.map((m, mi) => (
              <div key={m.key} className="space-y-2.5 rounded-lg border border-border/40 p-3">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2.5">
                  <MealChip>{t("nutrition.builder.numberedMeal", { n: mealNo(mi + 1) })}</MealChip>
                  <Input
                    value={m.name}
                    onChange={(e) => updateDay(day.day_of_week, (d) => ({ ...d, meals: d.meals.map((x) => (x.key === m.key ? { ...x, name: e.target.value } : x)) }))}
                    className="h-8 min-w-0 flex-1 font-semibold"
                    aria-label={t("nutrition.builder.mealNameAria")}
                  />
                  <MacroPill macros={mealTotals(m)} className="shrink-0 text-label-sm" />
                  <Button size="icon" variant="ghost" aria-label={t("nutrition.builder.moveUp")} onClick={() => moveMeal(m.key, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={t("nutrition.builder.moveDown")} onClick={() => moveMeal(m.key, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("nutrition.builder.removeMeal")}
                    onClick={() => updateDay(day.day_of_week, (d) => ({ ...d, meals: d.meals.filter((x) => x.key !== m.key) }))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {m.foods.map((f) => {
                    const scaled = roundMacros(foodMacros(f));
                    return (
                      <div key={f.key} className="rounded-lg bg-background/40 p-2.5">
                        <div className="flex items-center gap-1.5">
                          <p className="min-w-0 flex-1 truncate text-label-md font-semibold">
                            {f.foodName || t("nutrition.builder.foodFallback")}
                          </p>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={t("nutrition.builder.removeFood")}
                            onClick={() =>
                              updateDay(day.day_of_week, (d) => ({
                                ...d,
                                meals: d.meals.map((x) =>
                                  x.key === m.key ? { ...x, foods: x.foods.filter((y) => y.key !== f.key) } : x
                                ),
                              }))
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                        <MacroPill macros={scaled} className="mt-1 text-label-sm" />
                        <div className="mt-2 flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={f.quantity}
                            onChange={(e) =>
                              updateDay(day.day_of_week, (d) => ({
                                ...d,
                                meals: d.meals.map((x) =>
                                  x.key === m.key
                                    ? { ...x, foods: x.foods.map((y) => (y.key === f.key ? { ...y, quantity: e.target.value } : y)) }
                                    : x
                                ),
                              }))
                            }
                            className="h-7 w-20"
                            aria-label={t("nutrition.builder.quantityAria", { unit: f.serving_unit ?? t("nutrition.builder.units") })}
                          />
                          <span className="min-w-0 truncate text-label-sm text-faint">{f.serving_unit ?? ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button size="sm" variant="outline" onClick={() => setPickFor(m.key)}>
                  <Plus className="size-3 ms-1" /> {t("nutrition.builder.addFood")}
                </Button>
                {pickFor === m.key && (
                  <FoodPicker
                    onClose={() => setPickFor(null)}
                    onPick={(hit) => addFood(m.key, hit)}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nutrition.builder.selectDay")}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
          <span className="text-label-sm uppercase tracking-wider text-faint">{t("nutrition.builder.weeklyOverview")}</span>
          <MacroPill macros={weekTotals} className="text-label-sm" />
        </div>

        <p className="text-label-sm text-faint">{t("nutrition.builder.unsavedNote")}</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="glow-volt">
            {saving ? t("common.actions.saving") : seed.editing ? t("nutrition.builder.saveChanges") : t("nutrition.builder.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Enroll dialog ───────────────────────────────────────────────────────────

function EnrollDialog({
  program,
  clients,
  onClose,
}: {
  program: NutritionProgram;
  clients: ActiveClient[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [clientId, setClientId] = React.useState(clients[0]?.clientId ?? "");
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [weeks, setWeeks] = React.useState("4");
  const [saving, setSaving] = React.useState(false);

  // Expected meal count: meals per week × weeks (week-1 edge case ignored in preview).
  const mealsPerWeek = program.days.reduce((n, d) => n + d.meals.length, 0);
  const expected = mealsPerWeek * (Number(weeks) || 0);

  async function handleEnroll() {
    if (!clientId) {
      toast.error(t("nutrition.enroll.selectClient"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: program.id,
          client_id: clientId,
          start_date: startDate,
          duration_weeks: Number(weeks),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("nutrition.toasts.assignmentFailed"));
      toast.success(t("nutrition.enroll.assignedToast", { n: body.meals_generated ?? expected }));
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("nutrition.toasts.assignmentFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("nutrition.enroll.title", { name: program.name })}</DialogTitle>
          <DialogDescription>{t("nutrition.enroll.description", { n: expected })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="ne-client">{t("nutrition.enroll.client")}</Label>
            <select
              id="ne-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-body-md"
            >
              {clients.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ne-date">{t("nutrition.enroll.startDate")}</Label>
              <Input
                id="ne-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-lg bg-background px-3 text-body-md"
              />
            </div>
            <div>
              <Label htmlFor="ne-weeks">{t("nutrition.enroll.durationWeeks")}</Label>
              <Input
                id="ne-weeks"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="h-10 rounded-lg bg-background px-3 text-body-md"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.actions.cancel")}
          </Button>
          <Button onClick={handleEnroll} disabled={saving}>
            {saving ? t("nutrition.enroll.assigning") : t("nutrition.enroll.assignAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
