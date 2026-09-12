"use client";

import * as React from "react";
import type { SubscriptionPlan } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export function PlansClient({
  initialPlans,
  coachId,
}: {
  initialPlans: SubscriptionPlan[];
  coachId: string;
}) {
  const [plans, setPlans] = React.useState(initialPlans);
  const [editing, setEditing] = React.useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Keep initial in sync if server revalidates
  React.useEffect(() => setPlans(initialPlans), [initialPlans]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Live table columns: coach_id, name, price_usd, duration_days, max_clients
    const payload = {
      coach_id: coachId,
      name: String(fd.get("name") ?? "").trim(),
      price_usd: Number(fd.get("price") ?? 0),
      duration_days: Number(fd.get("duration_days") ?? 30),
      max_clients: fd.get("max_clients") ? Number(fd.get("max_clients")) : null,
    };

    if (!payload.name || payload.price_usd < 0) {
      toast.error("Name and valid price required");
      return;
    }

    setSaving(true);
    try {
      // RLS on the live table blocks direct authenticated writes — go through the server route
      const res = await fetch("/api/plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.error ?? "Save failed");
      if (editing) {
        setPlans((prev) => prev.map((p) => (p.id === editing.id ? (saved as SubscriptionPlan) : p)));
        toast.success("Plan updated");
      } else {
        setPlans((prev) => [saved as SubscriptionPlan, ...prev]);
        toast.success("Plan created");
      }
      setOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(plan: SubscriptionPlan) {
    setEditing(plan);
    setOpen(true);
  }

  function startCreate() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <>
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger render={<Button onClick={startCreate}>Create plan</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit plan" : "Create plan"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required placeholder="Starter — 1 Month" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price (USD)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.price_usd ?? ""}
                  required
                  placeholder="49.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duration (days)</Label>
                <Input id="duration_days" name="duration_days" type="number" min="1" defaultValue={editing?.duration_days ?? 30} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_clients">Max clients (optional)</Label>
                <Input
                  id="max_clients"
                  name="max_clients"
                  type="number"
                  min="1"
                  defaultValue={editing?.max_clients ?? ""}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create plan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-2xl font-bold">${Number(p.price_usd).toFixed(2)}</span>
                <span className="text-sm text-muted-foreground"> / {p.duration_days} days</span>
              </div>
              {p.max_clients != null && (
                <p className="text-xs text-muted-foreground">Up to {p.max_clients} clients</p>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => startEdit(p)}>
                Edit
              </Button>
              <p className="text-xs text-muted-foreground font-mono truncate">{p.id}</p>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">No plans yet. Create your first plan.</p>}
      </div>
    </>
  );
}
