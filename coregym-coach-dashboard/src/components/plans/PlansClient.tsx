"use client";

import * as React from "react";
import type { SubscriptionPlan } from "@/lib/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Minus, Pencil, Plus, PlusSquare, Users, Wallet, Zap, Layers } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "@/lib/i18n/client";
import { EmptyState } from "@/components/core/EmptyState";
import { PageHeader } from "@/components/core/PageHeader";
import { GlobalLink } from "@/components/shared/link";

// 15% platform commission — mirrors the server-side constant on
// /api/revenue and the Stripe fee fallback in the revenue page.
const PLATFORM_FEE = 0.15;

export function PlansClient({
  initialPlans,
  coachId,
  kpis,
  counts = {},
  section,
}: {
  initialPlans: SubscriptionPlan[];
  coachId: string;
  /** Server-rendered KPI row — rendered between the header and the grid. */
  kpis?: React.ReactNode;
  /** Active subscriptions per plan id (roster-load meters). Empty when the
   * roster read returned nothing (including the plans-RLS zero-rows case). */
  counts?: Record<string, number>;
  /** Grid header counters (exact total + active subscriptions). */
  section?: { count: number; activeSubs: number };
}) {
  const { t, fmt } = useI18n();
  const [plans, setPlans] = React.useState(initialPlans);
  const [editing, setEditing] = React.useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Drawer form state (controlled so the payout preview stays live)
  const [price, setPrice] = React.useState("");
  const [duration, setDuration] = React.useState("30");
  const [cap, setCap] = React.useState("");
  const [noCap, setNoCap] = React.useState(false);

  // Keep local state in sync when the server revalidates (render-time
  // adjustment instead of a cascading setState effect).
  const [prevInitial, setPrevInitial] = React.useState(initialPlans);
  if (prevInitial !== initialPlans) {
    setPrevInitial(initialPlans);
    setPlans(initialPlans);
  }

  // "Most popular" — highest REAL active-subscription count among loaded
  // plans (tie → higher price). Never rendered from an empty roster read.
  const popularId = React.useMemo(() => {
    if (plans.length <= 1) return null;
    const candidates = plans.filter((p) => (counts[p.id] ?? 0) > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, p) => {
      const c = counts[p.id] ?? 0;
      const bc = counts[best.id] ?? 0;
      if (c !== bc) return c > bc ? p : best;
      return Number(p.price_usd) > Number(best.price_usd) ? p : best;
    }).id;
  }, [plans, counts]);

  const capNum = Math.max(1, Math.floor(Number(cap) || 1));
  const grossCents = Math.round((Number(price) || 0) * 100);
  const feeCents = Math.round(grossCents * PLATFORM_FEE);
  const netCents = grossCents - feeCents;
  const yieldSeats = !noCap && cap !== "" ? capNum : null;

  function openDrawer(plan: SubscriptionPlan | null) {
    setEditing(plan);
    setPrice(plan != null ? String(plan.price_usd ?? "") : "");
    setDuration(String(plan?.duration_days ?? 30));
    setCap(plan?.max_clients != null ? String(plan.max_clients) : "");
    setNoCap(plan?.max_clients == null);
    setOpen(true);
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

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <PageHeader
          title={t("plans.page.title")}
          chip={t("plans.page.kicker")}
          description={t("plans.page.subtitle")}
          actions={
            <Button
              size="lg"
              className="shadow-md shadow-primary/20"
              onClick={() => openDrawer(null)}
            >
              <Plus className="size-4" />
              {t("plans.createAction")}
            </Button>
          }
        />
        {kpis}

        <SheetContent className="w-full sm:max-w-xl">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PlusSquare className="size-5" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <SheetTitle>
                    {editing ? t("plans.form.editTitle") : t("plans.form.createTitle")}
                  </SheetTitle>
                  <p className="text-body-sm text-faint">{t("plans.drawer.subtitle")}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  <span className="text-label-sm uppercase tracking-wider text-faint">
                    {t("common.table.name")}
                  </span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                  placeholder={t("plans.form.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">
                  <span className="text-label-sm uppercase tracking-wider text-faint">
                    {t("plans.form.price")}
                  </span>
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-body-md text-faint">
                    $
                  </span>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    placeholder="49.00"
                    className="ps-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration_days">
                  <span className="text-label-sm uppercase tracking-wider text-faint">
                    {t("plans.form.durationDays")}
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label={t("plans.form.durationDays")}
                    className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-secondary p-1"
                  >
                    {[30, 60, 90].map((d) => {
                      const active = Number(duration) === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDuration(String(d))}
                          className={cn(
                            "rounded-md px-2 py-1.5 text-label-sm transition-colors",
                            active
                              ? "bg-primary font-bold text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {t("plans.form.presetDays", { n: d })}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    id="duration_days"
                    name="duration_days"
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    required
                    aria-label={t("plans.form.custom")}
                    className="w-20 shrink-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  <span className="text-label-sm uppercase tracking-wider text-faint">
                    {t("plans.form.maxClients")}
                  </span>
                </Label>
                <div className={cn("flex items-center gap-2", noCap && "pointer-events-none opacity-50")}>
                  <button
                    type="button"
                    aria-label={t("plans.form.capacityDown")}
                    onClick={() => setCap(String(Math.max(1, capNum - 1)))}
                    className="flex size-8 shrink-0 items-center justify-center rounded bg-accent text-foreground transition-colors hover:bg-accent/80"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="min-w-14 text-center font-display text-headline-sm font-bold tabular-nums text-primary">
                    {fmt.num(capNum)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("plans.form.capacityUp")}
                    onClick={() => setCap(String(capNum + 1))}
                    className="flex size-8 shrink-0 items-center justify-center rounded bg-accent text-foreground transition-colors hover:bg-accent/80"
                  >
                    <Plus className="size-4" />
                  </button>
                  {!noCap && <input type="hidden" name="max_clients" value={capNum} />}
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="no-cap" checked={noCap} onCheckedChange={(v: boolean) => setNoCap(v)} />
                  <Label htmlFor="no-cap" className="text-body-sm font-normal normal-case tracking-normal">
                    {t("plans.form.noCap")}
                  </Label>
                </div>
                <p className="text-body-sm text-faint">{t("plans.form.capacityHint")}</p>
              </div>

              {/* Live payout preview — estimates only, labelled as such */}
              <div className="rounded-xl bg-background p-4 shadow-inner">
                <p className="flex items-center gap-1.5 text-label-sm uppercase tracking-wider text-faint">
                  <Wallet className="size-3.5" />
                  {t("plans.payout.title")}
                </p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-sm text-muted-foreground">{t("plans.payout.gross")}</span>
                    <span className="font-semibold tabular-nums text-foreground">{fmt.money(grossCents)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-sm text-muted-foreground">{t("plans.payout.fee")}</span>
                    <span className="font-semibold tabular-nums text-destructive">−{fmt.money(feeCents)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-sm text-muted-foreground">{t("plans.payout.net")}</span>
                    <span className="font-display text-headline-sm font-bold tabular-nums text-primary">
                      {fmt.money(netCents)}
                    </span>
                  </div>
                  {yieldSeats != null && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-body-sm text-muted-foreground">
                        {t("plans.payout.rosterYield", { n: yieldSeats })}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {fmt.money(netCents * yieldSeats)}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-label-sm text-faint">{t("plans.payout.disclaimer")}</p>
              </div>
            </div>

            <SheetFooter className="flex-row gap-2 border-t border-border/60 px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              >
                {t("plans.drawer.discard")}
              </Button>
              <Button type="submit" className="flex-1 shadow-md shadow-primary/20" disabled={saving}>
                {saving ? t("common.actions.saving") : t("plans.drawer.deploy")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Section header — grid scope */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-primary" />
          <h2 className="font-display text-headline-sm text-foreground">
            {t("plans.section.count", { n: section?.count ?? plans.length })}
          </h2>
        </div>
        <span className="text-label-sm uppercase tracking-wider text-faint">
          {t("plans.section.metaActive", { n: section?.activeSubs ?? 0 })}
        </span>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const active = counts[p.id] ?? 0;
          const maxClients = p.max_clients;
          const capped = maxClients != null;
          const pct =
            maxClients != null && maxClients > 0 ? Math.min(100, Math.round((active / maxClients) * 100)) : 0;
          const slotsLeft = maxClients != null ? Math.max(0, maxClients - active) : null;
          const scarce =
            maxClients != null && maxClients > 0 && slotsLeft != null && slotsLeft <= maxClients * 0.1;
          return (
            <Card
              key={p.id}
              className="relative h-full overflow-visible transition-colors hover:bg-secondary/60"
            >
              {p.id === popularId && (
                <span className="absolute top-0 end-8 flex -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-label-sm font-bold uppercase text-primary-foreground shadow-md shadow-primary/30">
                  <Zap className="size-3.5" />
                  {t("plans.card.mostPopular")}
                </span>
              )}
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex justify-end">
                  <span className="truncate font-mono text-body-sm text-faint">{p.id}</span>
                </div>
                <h3 className="font-display text-headline-md tracking-tight text-foreground">{p.name}</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-metric-display tabular-nums tracking-tight text-foreground">
                    {fmt.money(Number(p.price_usd) * 100)}
                  </span>
                  <span className="text-body-md text-muted-foreground">
                    {" "}
                    {t("plans.card.perDays", { n: p.duration_days })}
                  </span>
                </div>

                {capped ? (
                  <div className="rounded-lg bg-secondary p-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                          <Users className="size-4 text-mint" />
                          {t("plans.card.rosterLoad")}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {fmt.num(active)}{" "}
                          <span className="text-faint">
                            / {fmt.num(maxClients)} {t("plans.card.athletesUnit")}
                          </span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={cn("text-end text-label-sm", scarce ? "text-primary" : "text-muted-foreground")}>
                        {t("plans.card.slotsLeft", { n: slotsLeft ?? 0 })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-secondary p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                        <Users className="size-4 text-mint" />
                        {t("plans.card.rosterLoad")}
                      </span>
                      <span className="text-body-sm font-semibold text-foreground">
                        {t("plans.card.unlimitedSeats")}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-label-md"
                    onClick={() => openDrawer(p)}
                  >
                    <Pencil className="size-3.5" />
                    {t("plans.card.editPlan")}
                  </Button>
                  <GlobalLink
                    href="/dashboard/subscribers"
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    <Users className="size-3.5" />
                    {t("plans.card.athletesBtn", { n: active })}
                  </GlobalLink>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {plans.length === 0 && (
          <EmptyState
            icon={PlusSquare}
            className="lg:col-span-3"
            title={t("plans.empty")}
            hint={t("plans.emptyHint")}
            action={<Button onClick={() => openDrawer(null)}>{t("plans.createAction")}</Button>}
          />
        )}
      </div>
    </>
  );
}
