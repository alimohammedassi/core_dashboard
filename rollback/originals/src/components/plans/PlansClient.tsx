"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { SubscriptionPlan } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export function PlansClient({
  initialPlans,
  isMock,
  coachId,
}: {
  initialPlans: SubscriptionPlan[];
  isMock: boolean;
  coachId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [plans, setPlans] = React.useState(initialPlans);
  const [editing, setEditing] = React.useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = React.useState(false);

  // Keep initial in sync if server revalidates
  React.useEffect(() => setPlans(initialPlans), [initialPlans]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      coach_id: coachId,
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      price_cents: Math.round(Number(fd.get("price") ?? 0) * 100),
      duration_days: Number(fd.get("duration_days") ?? 30),
      currency: "usd",
      is_active: fd.get("is_active") === "on",
    };

    if (!payload.name || payload.price_cents < 0) {
      toast.error("Name and valid price required");
      return;
    }

    if (isMock) {
      if (editing) {
        setPlans((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...payload, updated_at: new Date().toISOString() } : p)));
        toast.success("Plan updated (mock)");
      } else {
        setPlans((prev) => [
          { id: `plan_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload } as SubscriptionPlan,
          ...prev,
        ]);
        toast.success("Plan created (mock)");
      }
      setOpen(false);
      setEditing(null);
      return;
    }

    try {
      if (editing) {
        const { data, error } = await supabase
          .from("subscription_plans")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setPlans((prev) => prev.map((p) => (p.id === editing.id ? (data as SubscriptionPlan) : p)));
        toast.success("Plan updated");
      } else {
        const { data, error } = await supabase.from("subscription_plans").insert(payload).select().single();
        if (error) throw error;
        setPlans((prev) => [data as SubscriptionPlan, ...prev]);
        toast.success("Plan created");
      }
      setOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
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
                  defaultValue={editing ? (editing.price_cents / 100).toFixed(2) : ""}
                  required
                  placeholder="49.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duration (days)</Label>
                <Input id="duration_days" name="duration_days" type="number" min="1" defaultValue={editing?.duration_days ?? 30} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} rows={3} placeholder="What’s included…" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} /> Active
              </label>
              <Button type="submit" className="w-full">
                {editing ? "Save changes" : "Create plan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isMock && <p className="text-xs text-amber-600">Mock mode — plans are not persisted until Supabase is connected (RLS allows coach to write own rows).</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "active" : "inactive"}</Badge>
              </div>
              <CardDescription className="line-clamp-2">{p.description ?? "No description"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-2xl font-bold">${(p.price_cents / 100).toFixed(2)}</span>
                <span className="text-sm text-muted-foreground"> / {p.duration_days} days</span>
              </div>
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
