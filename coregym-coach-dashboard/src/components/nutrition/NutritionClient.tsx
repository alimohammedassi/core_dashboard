"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Apple, Copy, Pencil, Trash2, UserPlus, Plus, ArrowUp, ArrowDown, X, Search } from "lucide-react";
import type { NutritionProgram } from "@/lib/nutrition";
import type { ActiveClient } from "@/lib/workouts";
import { scaleFood, roundMacros, sumMacros, type MacroSet } from "@/lib/nutrition-math";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
    foodName: f.foodName ?? "Food",
    serving_unit: f.serving_unit,
    serving_size: f.serving_size,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    quantity: String(f.quantity),
  };
}

function seedForCreate(): BuilderSeed {
  return {
    editing: null,
    name: "",
    description: "",
    days: [{ day_of_week: 1, notes: "", meals: [{ key: uid(), name: "Breakfast", foods: [] }] }],
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

function fmtMacros(m: MacroSet): string {
  return `${m.calories} kcal · ${m.protein_g}P / ${m.carbs_g}C / ${m.fat_g}F`;
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
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Search failed");
        setHits(body.foods ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Search failed");
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add food</DialogTitle>
          <DialogDescription>Search the food library. Values shown per serving basis.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search foods… (e.g. chicken)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {loading && <p className="text-sm text-muted-foreground px-1 py-4">Searching…</p>}
          {!loading && error && <p className="text-sm text-destructive px-1 py-4">{error}</p>}
          {!loading && !error && hits.length === 0 && (
            <p className="text-sm text-muted-foreground px-1 py-4">No foods found — try another search.</p>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onPick(h);
                onClose();
              }}
              className="w-full text-left rounded-lg border px-3 py-2 hover:bg-muted transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{h.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {h.serving_size ?? "—"} {h.serving_unit ?? ""}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {h.calories ?? 0} kcal · {h.protein_g ?? 0}P / {h.carbs_g ?? 0}C / {h.fat_g ?? 0}F
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
    if (!window.confirm(`Delete program “${program.name}”? This cannot be undone.`)) return;
    setBusyId(program.id);
    try {
      const res = await fetch(`/api/nutrition-programs?id=${encodeURIComponent(program.id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Delete failed");
      setPrograms((prev) => prev.filter((p) => p.id !== program.id));
      toast.success("Program deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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
      if (!res.ok) throw new Error(body?.error ?? "Duplicate failed");
      toast.success("Program duplicated — reopen it to edit");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setBuilderSeed(seedForCreate());
            setBuilderNonce((n) => n + 1);
          }}
        >
          Create Program
        </Button>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Apple className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No nutrition programs yet.</p>
              <p className="text-sm text-muted-foreground">
                Build a weekly meal plan from the food library,
                <br />
                then assign it to clients.
              </p>
            </div>
            <Button
              onClick={() => {
                setBuilderSeed(seedForCreate());
                setBuilderNonce((n) => n + 1);
              }}
            >
              Create Program
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate">{p.name}</CardTitle>
                  {p.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{p.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setBuilderSeed(seedForEdit(p));
                      setBuilderNonce((n) => n + 1);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Duplicate" disabled={busyId === p.id} onClick={() => handleDuplicate(p)}>
                    <Copy className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete" disabled={busyId === p.id} onClick={() => handleDelete(p)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((label, i) => {
                    const day = p.days.find((d) => d.day_of_week === i + 1);
                    const meals = day ? day.meals.length : 0;
                    return (
                      <Badge key={label} variant={day ? "default" : "outline"} title={day ? `${meals} meal(s)` : "Rest"}>
                        {label.slice(0, 3)}{day ? ` ·${meals}` : ""}
                      </Badge>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={clients.length === 0}
                  onClick={() => setEnrollSeed(p)}
                >
                  <UserPlus className="size-4 mr-2" />
                  {clients.length === 0 ? "No active subscribers" : "Assign to client"}
                </Button>
              </CardContent>
            </Card>
          ))}
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

  const day = days.find((d) => d.day_of_week === activeDay);

  function ensureDay(dow: number) {
    setDays((prev) => {
      if (prev.some((d) => d.day_of_week === dow)) return prev;
      return [...prev, { day_of_week: dow, notes: "", meals: [{ key: uid(), name: "Breakfast", foods: [] }] }].sort(
        (a, b) => a.day_of_week - b.day_of_week
      );
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
      meals: [...d.meals, { key: uid(), name: `Meal ${d.meals.length + 1}`, foods: [] }],
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
      toast.error("Program name is required");
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
      if (!res.ok) throw new Error(body?.error ?? "Save failed");
      toast.success(seed.editing ? "Program updated" : "Program created");
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
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const weekTotals = roundMacros(sumMacros(days.map(dayTotals)));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{seed.editing ? "Edit nutrition program" : "Create nutrition program"}</DialogTitle>
          <DialogDescription>
            Different meals per day, flexible meal count. Quantities use each food&apos;s own serving unit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="np-name">Name</Label>
            <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lean Mass — Week Plan" />
          </div>
          <div>
            <Label htmlFor="np-desc">Notes</Label>
            <Textarea id="np-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Coach notes…" rows={2} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {WEEKDAYS.map((label, i) => {
            const dow = i + 1;
            const has = days.some((d) => d.day_of_week === dow);
            return (
              <Button
                key={label}
                size="sm"
                variant={activeDay === dow ? "default" : has ? "secondary" : "outline"}
                onClick={() => (has ? setActiveDay(dow) : ensureDay(dow))}
              >
                {label.slice(0, 3)}
              </Button>
            );
          })}
        </div>

        {day ? (
          <div className="space-y-3 border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{WEEKDAYS[day.day_of_week - 1]} — {fmtMacros(dayTotals(day))}</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={addMeal}>
                  <Plus className="size-3 mr-1" /> Meal
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeDay(day.day_of_week)}>
                  Rest day
                </Button>
              </div>
            </div>
            {day.meals.map((m) => (
              <div key={m.key} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={m.name} onChange={(e) => updateDay(day.day_of_week, (d) => ({ ...d, meals: d.meals.map((x) => (x.key === m.key ? { ...x, name: e.target.value } : x)) }))} className="font-medium" aria-label="Meal name" />
                  <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => moveMeal(m.key, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => moveMeal(m.key, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove meal"
                    onClick={() => updateDay(day.day_of_week, (d) => ({ ...d, meals: d.meals.filter((x) => x.key !== m.key) }))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Meal total: {fmtMacros(mealTotals(m))}</p>
                <div className="space-y-1">
                  {m.foods.map((f) => {
                    const scaled = roundMacros(foodMacros(f));
                    return (
                      <div key={f.key} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{f.foodName}</p>
                          <p className="text-xs text-muted-foreground">
                            {scaled.calories} kcal · {scaled.protein_g}P / {scaled.carbs_g}C / {scaled.fat_g}F
                          </p>
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
                          aria-label={`Quantity in ${f.serving_unit ?? "units"}`}
                        />
                        <span className="text-xs text-muted-foreground w-14 shrink-0">{f.serving_unit ?? ""}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove food"
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
                  <Plus className="size-3 mr-1" /> Add food
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
          <p className="text-sm text-muted-foreground">Select a weekday above to add meals.</p>
        )}

        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          Weekly overview (planned days): <span className="font-medium">{fmtMacros(weekTotals)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : seed.editing ? "Save changes" : "Create program"}
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
  const [clientId, setClientId] = React.useState(clients[0]?.clientId ?? "");
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [weeks, setWeeks] = React.useState("4");
  const [saving, setSaving] = React.useState(false);

  // Expected meal count: meals per week × weeks (week-1 edge case ignored in preview).
  const mealsPerWeek = program.days.reduce((n, d) => n + d.meals.length, 0);
  const expected = mealsPerWeek * (Number(weeks) || 0);

  async function handleEnroll() {
    if (!clientId) {
      toast.error("Select a client");
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
      if (!res.ok) throw new Error(body?.error ?? "Assignment failed");
      toast.success(`Assigned — ${body.meals_generated ?? expected} meals generated`);
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign “{program.name}”</DialogTitle>
          <DialogDescription>Client must have an active subscription. ~{expected} meals will be generated.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="ne-client">Client</Label>
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
              <Label htmlFor="ne-date">Start date</Label>
              <Input id="ne-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ne-weeks">Duration (weeks)</Label>
              <Input id="ne-weeks" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleEnroll} disabled={saving}>
            {saving ? "Assigning…" : "Assign program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
