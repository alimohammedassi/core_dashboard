"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Apple, Copy, Pencil, Trash2, UserPlus, Plus, ArrowUp, ArrowDown, X, Search } from "lucide-react";
import type { NutritionProgram } from "@/lib/nutrition";
import type { ActiveClient } from "@/lib/workouts";
import { scaleFood, roundMacros, sumMacros, type MacroSet } from "@/lib/nutrition-math";
import { useI18n } from "@/lib/i18n/client";
import type { TFn } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/core/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

/** Compact macro summary: "1240 kcal · 120P / 150C / 45F" (technical shorthand
    kept in both languages). */
function macrosCompact(t: TFn, m: MacroSet): string {
  return t("nutrition.macros.compact", { kcal: m.calories, p: m.protein_g, c: m.carbs_g, f: m.fat_g });
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
        <div className="max-h-72 overflow-y-auto space-y-1">
          {loading && <p className="text-sm text-muted-foreground px-1 py-4">{t("nutrition.picker.searching")}</p>}
          {!loading && error && <p className="text-sm text-destructive px-1 py-4">{error}</p>}
          {!loading && !error && hits.length === 0 && (
            <p className="text-sm text-muted-foreground px-1 py-4">{t("nutrition.picker.noResults")}</p>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onPick(h);
                onClose();
              }}
              className="w-full text-start rounded-lg border px-3 py-2 hover:bg-muted transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{h.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {h.serving_size ?? "—"} {h.serving_unit ?? ""}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {macrosCompact(t, {
                  calories: h.calories ?? 0,
                  protein_g: h.protein_g ?? 0,
                  carbs_g: h.carbs_g ?? 0,
                  fat_g: h.fat_g ?? 0,
                })}
                {h.category ? ` · ${h.category}` : ""}
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
}: {
  initialPrograms: NutritionProgram[];
  clients: ActiveClient[];
}) {
  const router = useRouter();
  const { t } = useI18n();
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
    <>
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => {
            setBuilderSeed(seedForCreate(t("nutrition.builder.defaultMeal")));
            setBuilderNonce((n) => n + 1);
          }}
        >
          <Plus className="size-4" />
          {t("nutrition.createProgram")}
        </Button>
      </div>

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
            return (
              <Card key={p.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-headline-sm text-foreground">{p.name}</h3>
                      {p.description && (
                        <p className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">{p.description}</p>
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
    </>
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
  const { t } = useI18n();
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

        <div className="flex flex-wrap gap-1 mt-2">
          {weekdays.map((w, i) => {
            const dow = i + 1;
            const has = days.some((d) => d.day_of_week === dow);
            return (
              <Button
                key={w.short}
                size="sm"
                variant={activeDay === dow ? "default" : has ? "secondary" : "outline"}
                onClick={() => (has ? setActiveDay(dow) : ensureDay(dow))}
              >
                {w.short}
              </Button>
            );
          })}
        </div>

        {day ? (
          <div className="space-y-3 border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {weekdays[day.day_of_week - 1].full} — {macrosCompact(t, dayTotals(day))}
              </h3>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={addMeal}>
                  <Plus className="size-3 ms-1" /> {t("nutrition.builder.newMeal")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeDay(day.day_of_week)}>
                  {t("nutrition.builder.restDay")}
                </Button>
              </div>
            </div>
            {day.meals.map((m) => (
              <div key={m.key} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={m.name} onChange={(e) => updateDay(day.day_of_week, (d) => ({ ...d, meals: d.meals.map((x) => (x.key === m.key ? { ...x, name: e.target.value } : x)) }))} className="font-medium" aria-label={t("nutrition.builder.mealNameAria")} />
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
                <p className="text-xs text-muted-foreground">
                  {t("nutrition.builder.mealTotal", { macros: macrosCompact(t, mealTotals(m)) })}
                </p>
                <div className="space-y-1">
                  {m.foods.map((f) => {
                    const scaled = roundMacros(foodMacros(f));
                    return (
                      <div key={f.key} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{f.foodName || t("nutrition.builder.foodFallback")}</p>
                          <p className="text-xs text-muted-foreground">{macrosCompact(t, scaled)}</p>
                        </div>
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
                          className="w-24"
                          aria-label={t("nutrition.builder.quantityAria", { unit: f.serving_unit ?? t("nutrition.builder.units") })}
                        />
                        <span className="text-xs text-muted-foreground w-14 shrink-0">{f.serving_unit ?? ""}</span>
                        <Button
                          size="icon"
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
                          <X className="size-4" />
                        </Button>
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

        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          {t("nutrition.builder.weeklyOverview")} <span className="font-medium">{macrosCompact(t, weekTotals)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
              <Input id="ne-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ne-weeks">{t("nutrition.enroll.durationWeeks")}</Label>
              <Input id="ne-weeks" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
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
