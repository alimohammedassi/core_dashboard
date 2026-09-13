"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2, Users } from "lucide-react";
import type { CoachProgram } from "@/lib/programs";
import type { ActiveClient } from "@/lib/workouts";
import { generateEnrollmentDates, nextMonday } from "@/lib/program-dates";
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

type TemplateOption = { id: string; name: string };

// Fully-formed builder state, created inside click handlers (never render).
type BuilderSeed = {
  editing: CoachProgram | null;
  name: string;
  description: string;
  days: Record<number, string>; // day_of_week -> template_id (absent = rest)
};

function seedForCreate(): BuilderSeed {
  return { editing: null, name: "", description: "", days: {} };
}

function seedForEdit(program: CoachProgram): BuilderSeed {
  const days: Record<number, string> = {};
  for (const d of program.days) days[d.day_of_week] = d.template_id;
  return { editing: program, name: program.name, description: program.description ?? "", days };
}

export function ProgramsClient({
  initialPrograms,
  clients,
  templates,
}: {
  initialPrograms: CoachProgram[];
  clients: ActiveClient[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [programs, setPrograms] = React.useState(initialPrograms);
  const [builderSeed, setBuilderSeed] = React.useState<BuilderSeed | null>(null);
  const [builderNonce, setBuilderNonce] = React.useState(0);
  const [enrollSeed, setEnrollSeed] = React.useState<CoachProgram | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function upsertSaved(program: CoachProgram) {
    setPrograms((prev) => {
      const exists = prev.some((p) => p.id === program.id);
      return exists ? prev.map((p) => (p.id === program.id ? program : p)) : [program, ...prev];
    });
  }

  async function handleDelete(program: CoachProgram) {
    if (!window.confirm(`Delete program “${program.name}”? This cannot be undone.`)) return;
    setBusyId(program.id);
    try {
      const res = await fetch(`/api/coach-programs?id=${encodeURIComponent(program.id)}`, { method: "DELETE" });
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
            <Users className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No programs yet.</p>
              <p className="text-sm text-muted-foreground">
                Build a weekly schedule from your workout templates,
                <br />
                then enroll clients to generate their daily workouts.
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
            <Card key={p.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">{p.name}</CardTitle>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {p.days.length === 0 ? (
                    <Badge variant="secondary">No training days</Badge>
                  ) : (
                    p.days.map((d) => (
                      <Badge key={d.id} variant="secondary" className="rounded-full">
                        {weekdayShort(d.day_of_week)} · {d.templateName ?? "—"}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Updated {new Date(p.updated_at).toLocaleDateString()}</p>
                <div className="mt-auto grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setBuilderSeed(seedForEdit(p));
                      setBuilderNonce((n) => n + 1);
                    }}
                  >
                    <Pencil className="mr-1 size-3.5" /> Edit
                  </Button>
                  <Button size="sm" disabled={busyId === p.id} onClick={() => setEnrollSeed(p)}>
                    <CalendarPlus className="mr-1 size-3.5" /> Enroll
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busyId === p.id}
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="mr-1 size-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {builderSeed && (
        <ProgramBuilder
          key={builderNonce}
          seed={builderSeed}
          templates={templates}
          onOpenChange={(v) => {
            if (!v) setBuilderSeed(null);
          }}
          onSaved={upsertSaved}
        />
      )}
      {enrollSeed && (
        <EnrollDialog
          seed={enrollSeed}
          clients={clients}
          onOpenChange={(v) => {
            if (!v) setEnrollSeed(null);
          }}
          onEnrolled={() => router.refresh()}
        />
      )}
    </>
  );
}

function weekdayShort(dayOfWeek: number): string {
  return WEEKDAYS[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

// ── Program builder ──────────────────────────────────────────────────────────

function ProgramBuilder({
  seed,
  templates,
  onOpenChange,
  onSaved,
}: {
  seed: BuilderSeed;
  templates: TemplateOption[];
  onOpenChange: (v: boolean) => void;
  onSaved: (p: CoachProgram) => void;
}) {
  const [name, setName] = React.useState(seed.name);
  const [description, setDescription] = React.useState(seed.description);
  const [days, setDays] = React.useState<Record<number, string>>(seed.days);
  const [saving, setSaving] = React.useState(false);

  const usedCount = Object.values(days).filter(Boolean).length;

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Program name is required");
      return;
    }
    if (usedCount === 0) {
      toast.error("At least one weekday must have a template");
      return;
    }
    setSaving(true);
    try {
      const daysPayload = Object.entries(days)
        .filter(([, templateId]) => Boolean(templateId))
        .map(([dow, templateId], i) => ({ day_of_week: Number(dow), template_id: templateId, order_index: i }));
      const res = await fetch("/api/coach-programs", {
        method: seed.editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(seed.editing ? { id: seed.editing.id } : {}), name: name.trim(), description: description.trim() || null, days: daysPayload }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.error ?? "Save failed");
      onSaved(saved as CoachProgram);
      toast.success(seed.editing ? "Program updated" : "Program created");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{seed.editing ? "Edit program" : "Create program"}</DialogTitle>
          <DialogDescription>
            Pick one of your workout templates for each training day. Days left on “Rest” generate no workouts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prog-name">Name</Label>
            <Input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="PPL Weekly" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-desc">Description (optional)</Label>
            <Textarea
              id="prog-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Push / Pull / Legs, three sessions per week."
            />
          </div>

          <div className="space-y-2">
            <Label>Weekly schedule</Label>
            <div className="space-y-2">
              {WEEKDAYS.map((label, idx) => {
                const dow = idx + 1;
                return (
                  <div key={dow} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium">{label}</span>
                    <select
                      value={days[dow] ?? ""}
                      onChange={(e) =>
                        setDays((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[dow] = e.target.value;
                          else delete next[dow];
                          return next;
                        })
                      }
                      className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">Rest</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {templates.length === 0 && (
              <p className="text-xs text-destructive">
                You have no workout templates yet — create one in Workouts first.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : seed.editing ? "Save changes" : "Create program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Enroll dialog ────────────────────────────────────────────────────────────

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function EnrollDialog({
  seed,
  clients,
  onOpenChange,
  onEnrolled,
}: {
  seed: CoachProgram;
  clients: ActiveClient[];
  onOpenChange: (v: boolean) => void;
  onEnrolled?: () => void;
}) {
  const [clientId, setClientId] = React.useState("");
  const [startDate, setStartDate] = React.useState(() => nextMonday(todayLocal()));
  const [durationWeeks, setDurationWeeks] = React.useState("8");
  const [submitting, setSubmitting] = React.useState(false);

  const trainingDays = seed.days.map((d) => d.day_of_week);
  const duration = Number(durationWeeks);
  const expected =
    Number.isInteger(duration) && duration > 0 ? generateEnrollmentDates(startDate, duration, trainingDays).length : 0;

  async function handleSubmit() {
    if (!clientId) {
      toast.error("Select a client");
      return;
    }
    if (!startDate) {
      toast.error("Select a start date");
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      toast.error("Duration must be a positive whole number of weeks");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/program-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: seed.id,
          client_id: clientId,
          start_date: startDate,
          duration_weeks: duration,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Enrollment failed");
      const clientName = clients.find((c) => c.clientId === clientId)?.name ?? "client";
      toast.success(`${clientName} enrolled — ${body.generated ?? expected} workouts generated`);
      onOpenChange(false);
      onEnrolled?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll client — {seed.name}</DialogTitle>
          <DialogDescription>
            All {expected} workout{expected === 1 ? "" : "s"} for the full duration are generated immediately. The
            client sees them in the app like any other assigned workout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="enroll-client">Client (active subscribers)</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active subscribers yet.</p>
            ) : (
              <select
                id="enroll-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="enroll-start">Start date</Label>
              <Input
                id="enroll-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Next Monday is pre-filled.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-weeks">Duration (weeks)</Label>
              <Input
                id="enroll-weeks"
                type="number"
                min="1"
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Fixed duration — {expected} workouts.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || clients.length === 0}>
            {submitting ? "Enrolling…" : "Enroll client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
