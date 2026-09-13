"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Pencil, Send, Trash2, Layers } from "lucide-react";
import type { WorkoutTemplate } from "@/lib/supabase/types";
import type { ActiveClient } from "@/lib/workouts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateBuilder, seedForCreate, seedForEdit, type BuilderSeed } from "@/components/workouts/TemplateBuilder";
import { AssignDialog, type AssignSeed } from "@/components/workouts/AssignDialog";

// Date-only "tomorrow", built with local date parts (no UTC shifting).
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WorkoutsClient({
  initialTemplates,
  clients,
  catalog,
}: {
  initialTemplates: WorkoutTemplate[];
  clients: ActiveClient[];
  catalog: { id: string; name: string; muscleGroup: string | null }[];
}) {
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [builderSeed, setBuilderSeed] = React.useState<BuilderSeed | null>(null);
  const [builderNonce, setBuilderNonce] = React.useState(0);
  const [assign, setAssign] = React.useState<AssignSeed | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function upsertSaved(t: WorkoutTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((p) => p.id === t.id);
      return exists ? prev.map((p) => (p.id === t.id ? t : p)) : [t, ...prev];
    });
  }

  async function handleDuplicate(template: WorkoutTemplate) {
    setBusyId(template.id);
    try {
      const res = await fetch(`/api/workout-templates/${template.id}/duplicate`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Duplicate failed");
      setTemplates((prev) => [body as WorkoutTemplate, ...prev]);
      toast.success(`Duplicated as “${(body as WorkoutTemplate).name}”`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(template: WorkoutTemplate) {
    if (!window.confirm(`Delete “${template.name}”? This cannot be undone.`)) return;
    setBusyId(template.id);
    try {
      const res = await fetch(`/api/workout-templates/${template.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Delete failed");
      setTemplates((prev) => prev.filter((p) => p.id !== template.id));
      toast.success("Template deleted");
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
          Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Layers className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No workout templates yet.</p>
              <p className="text-sm text-muted-foreground">
                Create your first reusable workout template
                <br />
                to assign workouts to your clients.
              </p>
            </div>
            <Button
              onClick={() => {
                setBuilderSeed(seedForCreate());
                setBuilderNonce((n) => n + 1);
              }}
            >
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">{t.name}</CardTitle>
                {(t.target_muscles?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.target_muscles.map((m) => (
                      <Badge key={m} variant="secondary" className="rounded-full">
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {(t.exercises?.length ?? 0)} exercise{(t.exercises?.length ?? 0) === 1 ? "" : "s"}
                  {t.exercises && t.exercises.length > 0 && (
                    <span className="truncate"> · {t.exercises.map((e) => e.exercise_name).join(", ")}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Updated {new Date(t.updated_at).toLocaleDateString()}</p>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === t.id}
                    onClick={() => {
                      setBuilderSeed(seedForEdit(t));
                      setBuilderNonce((n) => n + 1);
                    }}
                  >
                    <Pencil className="mr-1 size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === t.id}
                    onClick={() => handleDuplicate(t)}
                  >
                    <Copy className="mr-1 size-3.5" /> Duplicate
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === t.id}
                    onClick={() => setAssign({ template: t, mode: "assign", defaultDate: tomorrowLocal() })}
                  >
                    <Send className="mr-1 size-3.5" /> Assign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === t.id}
                    onClick={() => setAssign({ template: t, mode: "program", defaultDate: tomorrowLocal() })}
                  >
                    <Layers className="mr-1 size-3.5" /> Program
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive col-span-2"
                    disabled={busyId === t.id}
                    onClick={() => handleDelete(t)}
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
        <TemplateBuilder
          key={builderNonce}
          seed={builderSeed}
          onOpenChange={(v) => {
            if (!v) setBuilderSeed(null);
          }}
          catalog={catalog}
          onSaved={upsertSaved}
        />
      )}
      <AssignDialog
        seed={assign}
        onOpenChange={(v) => {
          if (!v) setAssign(null);
        }}
        clients={clients}
      />
    </>
  );
}
