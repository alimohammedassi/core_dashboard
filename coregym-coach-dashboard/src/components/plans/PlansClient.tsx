"use client";

import * as React from "react";
import type { SubscriptionPlan } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";

export function PlansClient({
  initialPlans,
  coachId,
}: {
  initialPlans: SubscriptionPlan[];
  coachId: string;
}) {
  const { t, fmt } = useI18n();
  const [plans, setPlans] = React.useState(initialPlans);
  const [editing, setEditing] = React.useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Keep local state in sync when the server revalidates (render-time
  // adjustment instead of a cascading setState effect).
  const [prevInitial, setPrevInitial] = React.useState(initialPlans);
  if (prevInitial !== initialPlans) {
    setPrevInitial(initialPlans);
    setPlans(initialPlans);
  }

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
      toast.error(t("plans.toasts.invalid"));
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
      if (!res.ok) throw new Error(saved?.error ?? t("plans.toasts.saveFailed"));
      if (editing) {
        setPlans((prev) => prev.map((p) => (p.id === editing.id ? (saved as SubscriptionPlan) : p)));
        toast.success(t("plans.toasts.updated"));
      } else {
        setPlans((prev) => [saved as SubscriptionPlan, ...prev]);
        toast.success(t("plans.toasts.created"));
      }
      setOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("plans.toasts.saveFailed"));
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
          <DialogTrigger render={<Button onClick={startCreate}>{t("plans.createAction")}</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("plans.form.editTitle") : t("plans.form.createTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("common.table.name")}</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required placeholder={t("plans.form.namePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">{t("plans.form.price")}</Label>
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
                <Label htmlFor="duration_days">{t("plans.form.durationDays")}</Label>
                <Input id="duration_days" name="duration_days" type="number" min="1" defaultValue={editing?.duration_days ?? 30} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_clients">{t("plans.form.maxClients")}</Label>
                <Input
                  id="max_clients"
                  name="max_clients"
                  type="number"
                  min="1"
                  defaultValue={editing?.max_clients ?? ""}
                  placeholder={t("plans.form.maxClientsPlaceholder")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? t("common.actions.saving") : editing ? t("plans.form.saveChanges") : t("plans.createAction")}
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
                <span className="text-2xl font-bold">{fmt.money(Number(p.price_usd) * 100)}</span>
                <span className="text-sm text-muted-foreground"> {t("plans.card.perDays", { n: p.duration_days })}</span>
              </div>
              {p.max_clients != null && (
                <p className="text-xs text-muted-foreground">{t("plans.card.upToClients", { n: p.max_clients })}</p>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => startEdit(p)}>
                {t("common.actions.edit")}
              </Button>
              <p className="text-xs text-muted-foreground font-mono truncate">{p.id}</p>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">{t("plans.empty")}</p>}
      </div>
    </>
  );
}
