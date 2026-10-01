"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import type { CoachProgram } from "@/lib/programs";
import type { ActiveClient } from "@/lib/workouts";
import { generateEnrollmentDates, nextMonday } from "@/lib/program-dates";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/core/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Weekday dictionary keys, indexed by day_of_week - 1 (1 = Monday … 7 = Sunday).
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

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
  const { t, fmt } = useI18n();
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
    if (!window.confirm(`${t("programs.confirm.deleteProgram", { name: program.name })} ${t("common.confirm.cannotUndo")}`))
      return;
    setBusyId(program.id);
    try {
      const res = await fetch(`/api/coach-programs?id=${encodeURIComponent(program.id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("programs.error.deleteFailed"));
      setPrograms((prev) => prev.filter((p) => p.id !== program.id));
      toast.success(t("programs.toast.programDeleted"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("programs.error.deleteFailed"));
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
            setBuilderSeed(seedForCreate());
            setBuilderNonce((n) => n + 1);
          }}
        >
          <CalendarPlus className="size-4" />
          {t("programs.list.createProgram")}
        </Button>
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t("programs.list.emptyTitle")}
          hint={t("programs.list.emptyBody")}
          action={
            <Button
              onClick={() => {
                setBuilderSeed(seedForCreate());
                setBuilderNonce((n) => n + 1);
              }}
            >
              {t("programs.list.createProgram")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((p) => {
            // Stitch week strip: 7 fixed slots, template name per training day,
            // dimmed rest slots for everything else.
            const byDay = new Map<number, string>();
            for (const d of p.days) byDay.set(d.day_of_week, d.templateName ?? "—");
            return (
              <Card key={p.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="space-y-1">
                    <h3 className="font-display text-headline-sm text-foreground">{p.name}</h3>
                    {p.description && (
                      <p className="line-clamp-2 text-body-sm text-muted-foreground">{p.description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_KEYS.map((key, idx) => {
                      const dow = idx + 1;
                      const tplName = byDay.get(dow);
                      const rest = !tplName;
                      return (
                        <div
                          key={dow}
                          title={rest ? t("programs.builder.rest") : tplName}
                          className={`rounded-md border p-1.5 text-center ${
                            rest ? "border-border/60 bg-background/40" : "border-primary/25 bg-primary/10"
                          }`}
                        >
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${rest ? "text-faint" : "text-primary"}`}>
                            {t(`programs.weekdaysShort.${key}`)}
                          </p>
                          <p className={`mt-0.5 line-clamp-2 text-[11px] leading-tight ${rest ? "text-faint/70" : "text-foreground"}`}>
                            {rest ? t("programs.builder.rest") : tplName}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-auto flex items-center gap-1.5 text-body-sm text-faint">
                    <span className="size-1.5 rounded-full bg-primary/60" />
                    {t("programs.list.updated", { date: fmt.date(p.updated_at) })}
                  </p>

                  <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === p.id}
                      onClick={() => {
                        setBuilderSeed(seedForEdit(p));
                        setBuilderNonce((n) => n + 1);
                      }}
                    >
                      <Pencil className="size-3.5" /> {t("common.actions.edit")}
                    </Button>
                    <Button size="sm" disabled={busyId === p.id} onClick={() => setEnrollSeed(p)}>
                      <CalendarPlus className="size-3.5" /> {t("programs.list.enroll")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ms-auto text-destructive hover:text-destructive"
                      aria-label={t("common.actions.delete")}
                      title={t("common.actions.delete")}
                      disabled={busyId === p.id}
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
  const { t } = useI18n();
  const [name, setName] = React.useState(seed.name);
  const [description, setDescription] = React.useState(seed.description);
  const [days, setDays] = React.useState<Record<number, string>>(seed.days);
  const [saving, setSaving] = React.useState(false);

  const usedCount = Object.values(days).filter(Boolean).length;

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("programs.validate.nameRequired"));
      return;
    }
    if (usedCount === 0) {
      toast.error(t("programs.validate.needDay"));
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
      if (!res.ok) throw new Error(saved?.error ?? t("programs.error.saveFailed"));
      onSaved(saved as CoachProgram);
      toast.success(seed.editing ? t("programs.toast.programUpdated") : t("programs.toast.programCreated"));
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("programs.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{seed.editing ? t("programs.builder.editTitle") : t("programs.builder.createTitle")}</DialogTitle>
          <DialogDescription>{t("programs.builder.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prog-name">{t("common.table.name")}</Label>
            <Input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("programs.builder.namePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-desc">{t("programs.builder.descLabel")}</Label>
            <Textarea
              id="prog-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("programs.builder.descPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("programs.builder.schedule")}</Label>
            <div className="space-y-2">
              {WEEKDAY_KEYS.map((key, idx) => {
                const dow = idx + 1;
                return (
                  <div key={dow} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium">{t(`programs.weekdays.${key}`)}</span>
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
                      <option value="">{t("programs.builder.rest")}</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {templates.length === 0 && (
              <p className="text-xs text-destructive">{t("programs.builder.noTemplates")}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving
              ? t("common.actions.saving")
              : seed.editing
                ? t("programs.builder.saveChanges")
                : t("programs.builder.createSubmit")}
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
  const { t } = useI18n();
  const [clientId, setClientId] = React.useState("");
  const [startDate, setStartDate] = React.useState(() => nextMonday(todayLocal()));
  const [durationWeeks, setDurationWeeks] = React.useState("8");
  const [submitting, setSubmitting] = React.useState(false);

  const trainingDays = seed.days.map((d) => d.day_of_week);
  const duration = Number(durationWeeks);
  const expected =
    Number.isInteger(duration) && duration > 0 ? generateEnrollmentDates(startDate, duration, trainingDays).length : 0;

  // Reusable enrolled-toast: picks the singular/plural copy on the generated count.
  function enrolledToast(generated: number, clientName: string) {
    toast.success(
      generated === 1
        ? t("programs.toast.enrolledOne", { client: clientName })
        : t("programs.toast.enrolledMany", { client: clientName, n: generated })
    );
  }

  async function handleSubmit() {
    if (!clientId) {
      toast.error(t("programs.validate.selectClient"));
      return;
    }
    if (!startDate) {
      toast.error(t("programs.validate.selectStartDate"));
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      toast.error(t("programs.validate.durationPositive"));
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
      if (!res.ok) {
        // One active program per client: offer to replace it.
        if (res.status === 409 && body?.existing_enrollment_id) {
          const clientName = clients.find((c) => c.clientId === clientId)?.name ?? t("programs.enroll.thisClient");
          const replace = window.confirm(
            t("programs.confirm.replace", { client: clientName, program: seed.name })
          );
          if (!replace) return;
          const del = await fetch(
            `/api/program-enrollments/${encodeURIComponent(body.existing_enrollment_id)}`,
            { method: "DELETE" }
          );
          const delBody = await del.json();
          if (!del.ok) throw new Error(delBody?.error ?? t("programs.error.removeCurrent"));
          const retry = await fetch("/api/program-enrollments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              program_id: seed.id,
              client_id: clientId,
              start_date: startDate,
              duration_weeks: duration,
            }),
          });
          const retryBody = await retry.json();
          if (!retry.ok) throw new Error(retryBody?.error ?? t("programs.error.enrollFailed"));
          enrolledToast(Number(retryBody.generated ?? expected), clientName);
          onOpenChange(false);
          onEnrolled?.();
          return;
        }
        throw new Error(body?.error ?? t("programs.error.enrollFailed"));
      }
      const clientName = clients.find((c) => c.clientId === clientId)?.name ?? t("programs.enroll.clientFallback");
      enrolledToast(Number(body.generated ?? expected), clientName);
      onOpenChange(false);
      onEnrolled?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("programs.error.enrollFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("programs.enroll.title", { name: seed.name })}</DialogTitle>
          <DialogDescription>
            {expected === 1
              ? t("programs.enroll.descOne")
              : t("programs.enroll.descMany", { n: expected })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="enroll-client">{t("programs.enroll.clientLabel")}</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("programs.enroll.noClients")}</p>
            ) : (
              <select
                id="enroll-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">{t("programs.enroll.selectClient")}</option>
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
              <Label htmlFor="enroll-start">{t("programs.enroll.startLabel")}</Label>
              <Input
                id="enroll-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("programs.enroll.startHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-weeks">{t("programs.enroll.durationLabel")}</Label>
              <Input
                id="enroll-weeks"
                type="number"
                min="1"
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("programs.enroll.durationHint", { n: expected })}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || clients.length === 0}>
            {submitting ? t("programs.enroll.submitting") : t("programs.enroll.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
